import { AsyncLocalStorage } from 'node:async_hooks';
import type { ChangedEntity } from '@common/changes';
import type { AppEventName, AppEvents } from '@common/events';
import type { DevBrain, Workspace } from '@main/core';
import type { ArchiveChange } from '@main/core/archive/service';
import type { FavoriteChange } from '@main/core/favorites/service';
import type { TaskLinkChange } from '@main/core/integrations/detach';
import type { IntegrationChange } from '@main/core/integrations/service';
import type { SearchChange } from '@main/core/search/service';
import type { SyncProgress } from '@main/core/sync/types';

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
 */
export class ChangeTracker {
  private readonly runningMutation = new AsyncLocalStorage<RunningMutation>();
  // The entities changed in the background during this turn of the event loop, batched to go out
  // together as one `db.changes` at its end.
  private readonly backgroundBatch = new Set<ChangedEntity>();
  // the batch's send, scheduled by the first background change of the turn
  private scheduledBatchSend: NodeJS.Immediate | null = null;
  private stopWatching: (() => void) | null = null;

  constructor(private readonly sendToWindows: SendToWindows) {}

  /** Follows `devBrain`'s workspaces from now on. Returns the function that stops. */
  watch(devBrain: Pick<DevBrain, 'currentWorkspace' | 'workspaces'>): () => void {
    this.stopWatching?.();
    const current = devBrain.currentWorkspace;
    let stopListeningToWorkspace = current ? this.listenToWorkspace(current) : () => {};
    const unsubscribe = devBrain.workspaces.onChange((change) => {
      // the registry changed: the workspace list refetches; for a new workspace, nothing else did
      this.recordChange('workspace');
      if (change.type === 'created') return;
      stopListeningToWorkspace();
      stopListeningToWorkspace =
        change.type === 'opened' ? this.listenToWorkspace(change.workspace) : () => {};
      const id = change.type === 'opened' ? change.workspace.info.id : null;
      // to every window, the one that switched too: this event alone says which workspace is open
      this.sendToWindows('workspace.changed', { id });
    });
    this.stopWatching = () => {
      unsubscribe();
      stopListeningToWorkspace();
      this.stopWatching = null;
    };
    return this.stopWatching;
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
      workspace.tasks.onChange(() => this.recordChange('task')),
      workspace.projects.onChange(() => this.recordChange('project')),
      workspace.notes.onChange(() => this.recordChange('note')),
      workspace.events.onChange(() => this.recordChange('event')),
      workspace.calendars.onChange(() => this.recordChange('calendar')),
      workspace.archive.onChange((change) => this.recordChange(...entitiesOfArchiveChange(change))),
      workspace.favorites.onChange((change) => this.recordChange(entityOfFavoriteChange(change))),
      // index writes that finish after the change that caused them, such as a restored note's
      workspace.search.onChange((change) => this.recordChange(...entitiesOfSearchChange(change))),
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

export function entitiesOfArchiveChange({
  taskIds,
  projectIds,
  noteIds,
}: ArchiveChange): ChangedEntity[] {
  const entities: ChangedEntity[] = [];
  if (taskIds.length > 0) entities.push('task');
  if (projectIds.length > 0) entities.push('project');
  if (noteIds.length > 0) entities.push('note');
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

// the entities whose search entries changed: search reads them all
export function entitiesOfSearchChange(change: SearchChange): ChangedEntity[] {
  return change.type === 'notes_indexed' ? ['note'] : ['task', 'project', 'note', 'event'];
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
