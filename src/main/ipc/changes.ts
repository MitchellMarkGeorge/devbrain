import { AsyncLocalStorage } from 'node:async_hooks';
import type { ChangedEntity } from '@common/changes';
import type { AppEventName, AppEvents } from '@common/events';
import type { WorkspaceSnapshot, WorkspaceState } from '@common/types';
import type { DevBrain, Workspace } from '@main/core';
import type { ArchiveChange } from '@main/core/archive/service';
import type { FavoriteChange } from '@main/core/favorites/service';
import type { TaskLinkChange } from '@main/core/integrations/detach';
import type { IntegrationChange } from '@main/core/integrations/service';
import type { NoteChange } from '@main/core/notes/service';
import type { ProjectChange } from '@main/core/projects/service';
import type { TaskChange } from '@main/core/tasks/service';
import type { SyncProgress } from '@main/core/sync/types';
import { serializeError } from './errors';

// Sends an event to the app's windows, skipping `skipWindow` when given: the window a mutation came
// from, which has these changes in its response already. The tracker never sees a window:
// src/main/index.ts sends through webContents.
export type SendToWindows = <K extends AppEventName>(
  name: K,
  payload: AppEvents[K],
  skipWindow?: unknown,
) => void;

// An IPC mutation the tracker is running, found through the async context of the code that runs it.
interface RunningMutation {
  // set once it has answered: what it left running (a sync run after a connect) changes rows in
  // the background from then on
  answered: boolean;
  addEntities(entities: ChangedEntity[]): void;
}

/**
 * Turns what core's services change into the entities the renderer refetches for
 * (docs/ipc/change-propagation-research.md). It listens to every service of the open workspace,
 * following a switch.
 *
 * - A change made while an IPC mutation runs goes in that mutation's `changed`, so the renderer
 *   refetches before the mutation settles. Once it has answered, the other windows get the same
 *   entities as a `db.changes` event.
 * - A change made outside any mutation (sync, work a mutation left running) is a background
 *   change. The entities of every background change in one turn of the event loop go out
 *   together as one `db.changes`, so the several events of one write (a sync page that writes
 *   tasks and projects) refetch once.
 * - For a status UI, it also sends what integrations and sync report as deltas, at once and to
 *   every window: `sync.progress` per committed page, `integrations.changed` per integration
 *   change, and `sources.changed` when a source is switched on or off or a run records how it
 *   ended. Ids and status only, never credentials.
 * - It owns the workspace state the windows show (onboarding, the splash, the app) and sends it
 *   whole as `workspace.changed` at each change, with a version that goes up each time. A page
 *   loading reads it with the initial load context (`getWorkspaceSnapshot()`).
 */
export class ChangeTracker {
  private readonly runningMutation = new AsyncLocalStorage<RunningMutation>();
  // The entities changed in the background during this turn of the event loop, batched to go out
  // together as one `db.changes` at its end.
  private readonly backgroundBatch = new Set<ChangedEntity>();
  // the batch's send, scheduled by the first background change of the turn
  private scheduledBatchSend: NodeJS.Immediate | null = null;
  private stopWatching: (() => void) | null = null;
  // what the windows were last told the workspace state is
  private workspaceSnapshot: WorkspaceSnapshot = {
    version: 0,
    state: { status: 'none', error: null },
  };

  constructor(private readonly sendToWindows: SendToWindows) {}

  /** The workspace state as the windows last heard it: what a page loading now starts from. */
  getWorkspaceSnapshot(): WorkspaceSnapshot {
    return this.workspaceSnapshot;
  }

  /** Follows `devBrain`'s settings and workspaces from now on. Returns the function that stops. */
  watch(devBrain: Pick<DevBrain, 'currentWorkspace' | 'workspaces' | 'settings'>): () => void {
    this.stopWatching?.();
    const current = devBrain.currentWorkspace;
    let stopListeningToWorkspace = current ? this.listenToWorkspace(current) : () => {};
    // no window has loaded yet: the first reads it with the initial load context
    if (current) {
      this.workspaceSnapshot = {
        version: this.workspaceSnapshot.version + 1,
        state: { status: 'open', workspace: current.info, error: null },
      };
    }
    const unsubscribe = devBrain.workspaces.onChange((change) => {
      // the registry changed: the workspace list refetches; for a new, renamed or recoloured
      // workspace, nothing else did
      this.recordChange('workspace');
      switch (change.type) {
        case 'created':
        case 'updated':
        case 'imported':
          return;
        case 'opening':
          this.setWorkspaceState({
            status: 'opening',
            workspace: devBrain.workspaces.getById(change.workspaceId),
          });
          return;
        case 'closed':
          stopListeningToWorkspace();
          stopListeningToWorkspace = () => {};
          // a switch closes the old workspace mid-open: the splash stays, rather than onboarding
          // flashing between the two
          if (this.workspaceSnapshot.state.status === 'opening') return;
          this.setWorkspaceState({ status: 'none', error: null });
          return;
        case 'opened':
          stopListeningToWorkspace();
          stopListeningToWorkspace = this.listenToWorkspace(change.workspace);
          this.setWorkspaceState({
            status: 'open',
            workspace: infoOf(devBrain, change.workspace),
            error: null,
          });
          return;
        case 'openFailed': {
          const error = serializeError(change.error);
          // a workspace whose folder is gone fails before the open one closes: back to it
          const stillOpen = devBrain.currentWorkspace;
          this.setWorkspaceState(
            stillOpen
              ? { status: 'open', workspace: stillOpen.info, error }
              : { status: 'none', error },
          );
          return;
        }
      }
    });
    // the app's settings, from Settings or the menu
    const unsubscribeSettings = devBrain.settings.onChange(() => this.recordChange('settings'));
    this.stopWatching = () => {
      unsubscribe();
      unsubscribeSettings();
      stopListeningToWorkspace();
      this.stopWatching = null;
    };
    return this.stopWatching;
  }

  // the new state, whole, to every window, the one that switched too: this event alone says what
  // the window shows
  private setWorkspaceState(state: WorkspaceState): void {
    this.workspaceSnapshot = { version: this.workspaceSnapshot.version + 1, state };
    this.sendToWindows('workspace.changed', this.workspaceSnapshot);
  }

  /**
   * Runs one IPC mutation from `window`, giving `onChange` the entities core changes while it runs.
   * Once it has settled, the other windows get those entities as a `db.changes` event.
   */
  async trackMutation<T>(
    window: unknown,
    onChange: (entities: ChangedEntity[]) => void,
    run: () => Promise<T>,
  ): Promise<T> {
    const changedEntities = new Set<ChangedEntity>();
    const mutation: RunningMutation = {
      answered: false,
      addEntities: (entities) => {
        entities.forEach((entity) => changedEntities.add(entity));
        onChange(entities);
      },
    };
    try {
      return await this.runningMutation.run(mutation, run);
    } finally {
      mutation.answered = true;
      if (changedEntities.size > 0) {
        this.sendToWindows('db.changes', { entities: [...changedEntities] }, window);
      }
    }
  }

  // to the running mutation's response, or to this turn's background batch
  private recordChange(...entities: ChangedEntity[]): void {
    if (entities.length === 0) return;
    const mutation = this.currentMutation();
    if (mutation) {
      mutation.addEntities(entities);
      return;
    }
    entities.forEach((entity) => this.backgroundBatch.add(entity));
    this.scheduledBatchSend ??= setImmediate(() => this.sendBackgroundBatch());
  }

  // sends the turn's batch as one `db.changes`, and starts the next batch empty
  private sendBackgroundBatch(): void {
    this.scheduledBatchSend = null;
    if (this.backgroundBatch.size === 0) return;
    const entities = [...this.backgroundBatch];
    this.backgroundBatch.clear();
    this.sendToWindows('db.changes', { entities });
  }

  // the mutation the calling code runs for, until it has answered
  private currentMutation(): RunningMutation | undefined {
    const mutation = this.runningMutation.getStore();
    return mutation && !mutation.answered ? mutation : undefined;
  }

  // listens to every service of `workspace` that changes rows; returns the function that stops
  private listenToWorkspace(workspace: Workspace): () => void {
    const { sync } = workspace;
    const unsubscribes = [
      workspace.tasks.onChange((change) => this.recordChange(...entitiesOfTaskChange(change))),
      workspace.projects.onChange((change) =>
        this.recordChange(...entitiesOfProjectChange(change)),
      ),
      workspace.notes.onChange((change) => this.recordChange(...entitiesOfNoteChange(change))),
      workspace.events.onChange(() => this.recordChange('event')),
      workspace.calendars.onChange(() => this.recordChange('calendar')),
      workspace.archive.onChange((change) => this.recordChange(...entitiesOfArchiveChange(change))),
      workspace.favorites.onChange((change) => this.recordChange(entityOfFavoriteChange(change))),
      workspace.recents.onChange(() => this.recordChange('recent')),
      workspace.detach.onChange((change) => this.recordChange(...entitiesOfTaskLinkChange(change))),
      workspace.integrations.onChange((change) => {
        this.recordChange(...entitiesOfIntegrationChange(change));
        this.sendIntegrationStatus(change);
      }),
      // each committed page, with what it wrote
      sync.onProgress((progress) => {
        this.recordChange(...progress.summary.changed);
        this.sendToWindows('sync.progress', syncProgressEvent(progress));
      }),
      // how a source's run ended: its last sync, error and retry time
      sync.onStatus(({ sourceId }) => {
        this.recordChange('externalSource');
        this.sendToWindows('sources.changed', { sourceId });
      }),
    ];
    return () => unsubscribes.forEach((unsubscribe) => unsubscribe());
  }

  // The status deltas, for a status UI: sent at once to every window, the one whose mutation
  // caused them too, beside the entities the change maps to. A source switched on or off is also a
  // change of its own row.
  private sendIntegrationStatus(change: IntegrationChange): void {
    const { integrationId, type } = change;
    this.sendToWindows('integrations.changed', { integrationId, type });
    if (change.type === 'source_changed') {
      this.sendToWindows('sources.changed', { sourceId: change.sourceId });
    }
  }
}

// a committed page as the status UI shows it: how far the run has got, not what it wrote
export function syncProgressEvent({
  sourceId,
  phase,
  itemsApplied,
}: SyncProgress): AppEvents['sync.progress'] {
  return { sourceId, phase, itemsApplied };
}

// A delete also changes the rows that pointed at what it removed: a deleted task's notes lose their
// link, a deleted project's tasks and notes their project, a deleted note's tasks their link (or
// their task note).
export function entitiesOfTaskChange(change: TaskChange): ChangedEntity[] {
  if (change.type !== 'deleted' || change.unlinkedNoteIds.length === 0) return ['task'];
  return ['task', 'note'];
}

export function entitiesOfProjectChange(change: ProjectChange): ChangedEntity[] {
  const entities: ChangedEntity[] = ['project'];
  if (change.type !== 'deleted') return entities;
  if (change.unfiledTaskIds.length > 0) entities.push('task');
  if (change.unfiledNoteIds.length > 0) entities.push('note');
  return entities;
}

export function entitiesOfNoteChange(change: NoteChange): ChangedEntity[] {
  if (change.type !== 'deleted') return ['note'];
  // a task note's task, or the tasks made from the note
  const tasksChanged = change.linkedTaskId !== null || change.unlinkedTaskIds.length > 0;
  return tasksChanged ? ['note', 'task'] : ['note'];
}

// an emptied trash also changes the rows left that lost a link to what it deleted
export function entitiesOfArchiveChange(change: ArchiveChange): ChangedEntity[] {
  const { taskIds, projectIds, noteIds } = change;
  const tasksChanged =
    taskIds.length > 0 || (change.type === 'emptied' && change.unlinkedTaskIds.length > 0);
  const notesChanged =
    noteIds.length > 0 || (change.type === 'emptied' && change.unlinkedNoteIds.length > 0);
  const entities: ChangedEntity[] = [];
  if (tasksChanged) entities.push('task');
  if (projectIds.length > 0) entities.push('project');
  if (notesChanged) entities.push('note');
  return entities;
}

const FAVORITE_ENTITIES = {
  tasks: 'task',
  projects: 'project',
  notes: 'note',
  events: 'event',
} as const satisfies Record<FavoriteChange['entityType'], ChangedEntity>;

export function entityOfFavoriteChange(change: FavoriteChange): ChangedEntity {
  return FAVORITE_ENTITIES[change.entityType];
}

export function entitiesOfTaskLinkChange(change: TaskLinkChange): ChangedEntity[] {
  // rejected credentials move the integration to needs_reauth, which it reports itself
  if (change.type === 'credentials_rejected') return ['integration'];
  return ['task', ...change.changed];
}

export function entitiesOfIntegrationChange(change: IntegrationChange): ChangedEntity[] {
  const entities: ChangedEntity[] = ['integration', 'externalSource'];
  if (change.type === 'disconnected') entities.push(...change.changed);
  return entities;
}

// The workspace's info as the registry has it now: a workspace reopened onto itself has saved its
// last page since its info was read
function infoOf(devBrain: Pick<DevBrain, 'workspaces'>, workspace: Workspace): Workspace['info'] {
  try {
    return devBrain.workspaces.getById(workspace.info.id);
  } catch {
    return workspace.info;
  }
}
