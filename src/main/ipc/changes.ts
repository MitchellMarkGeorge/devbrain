import { AsyncLocalStorage } from 'node:async_hooks';
import type { ChangedEntity } from '@common/changes';
import type { AppEventName, AppEvents } from '@common/events';
import type { DevBrain, Workspace } from '@main/core';
import type { ArchiveChange } from '@main/core/archive/service';
import type { FavoriteChange } from '@main/core/favorites/service';
import type { TaskLinkChange } from '@main/core/integrations/detach';
import type { IntegrationChange } from '@main/core/integrations/service';

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
  // the window that called it
  window: unknown;
  // set once it has answered: what it left running (a sync run after a connect) changes rows in
  // the background from then on
  answered: boolean;
  addKinds(kinds: ChangedEntity[]): void;
}

/**
 * Turns what core's services change into the kinds of rows the renderer refetches for
 * (docs/ipc/change-propagation-research.md). It listens to every service of the open workspace,
 * following a switch.
 *
 * - A change made while an IPC mutation runs goes in that mutation's `changed`, so the renderer
 *   refetches before the mutation settles. Once it has answered, the other windows get the same
 *   kinds as a `db.changes` event.
 * - A change made outside any mutation (sync, work a mutation left running) is a background
 *   change. The kinds of every background change in one turn of the event loop go out together as
 *   one `db.changes`, so the several events of one write (a sync page that writes tasks and
 *   projects) refetch once.
 */
export class ChangeTracker {
  private readonly runningMutation = new AsyncLocalStorage<RunningMutation>();
  // what changed in the background since the last send
  private readonly backgroundKinds = new Set<ChangedEntity>();
  // the send at the end of this turn of the event loop, once a background change is waiting
  private backgroundSend: NodeJS.Immediate | null = null;
  private stopWatching: (() => void) | null = null;

  constructor(private readonly sendToWindows: SendToWindows) {}

  /** Follows `devBrain`'s workspaces from now on. Returns the function that stops. */
  watch(devBrain: Pick<DevBrain, 'currentWorkspace' | 'workspaces'>): () => void {
    this.stopWatching?.();
    const current = devBrain.currentWorkspace;
    let stopListeningToWorkspace = current ? this.listenToWorkspace(current) : () => {};
    const unsubscribe = devBrain.workspaces.onChange((change) => {
      // the registry changed; for a new workspace, nothing else did
      this.recordChange('workspace');
      if (change.type === 'created') return;
      stopListeningToWorkspace();
      stopListeningToWorkspace =
        change.type === 'opened' ? this.listenToWorkspace(change.workspace) : () => {};
      const id = change.type === 'opened' ? change.workspace.info.id : null;
      this.sendToWindows('workspace.changed', { id }, this.currentMutation()?.window);
    });
    this.stopWatching = () => {
      unsubscribe();
      stopListeningToWorkspace();
      this.stopWatching = null;
    };
    return this.stopWatching;
  }

  /**
   * Runs one IPC mutation from `window`, giving `onChange` the kinds of rows core changes while it
   * runs. Once it has settled, the other windows get those kinds as a `db.changes` event.
   */
  async trackMutation<T>(
    window: unknown,
    onChange: (kinds: ChangedEntity[]) => void,
    run: () => Promise<T>,
  ): Promise<T> {
    const changedKinds = new Set<ChangedEntity>();
    const mutation: RunningMutation = {
      window,
      answered: false,
      addKinds: (kinds) => {
        kinds.forEach((kind) => changedKinds.add(kind));
        onChange(kinds);
      },
    };
    try {
      return await this.runningMutation.run(mutation, run);
    } finally {
      mutation.answered = true;
      if (changedKinds.size > 0) {
        this.sendToWindows('db.changes', { entities: [...changedKinds] }, window);
      }
    }
  }

  // to the running mutation's response, or to this turn's background send
  private recordChange(...kinds: ChangedEntity[]): void {
    if (kinds.length === 0) return;
    const mutation = this.currentMutation();
    if (mutation) {
      mutation.addKinds(kinds);
      return;
    }
    kinds.forEach((kind) => this.backgroundKinds.add(kind));
    this.backgroundSend ??= setImmediate(() => this.sendBackgroundKinds());
  }

  private sendBackgroundKinds(): void {
    this.backgroundSend = null;
    if (this.backgroundKinds.size === 0) return;
    const kinds = [...this.backgroundKinds];
    this.backgroundKinds.clear();
    this.sendToWindows('db.changes', { entities: kinds });
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
      workspace.archive.onChange((change) => this.recordChange(...kindsOfArchiveChange(change))),
      workspace.favorites.onChange((change) => this.recordChange(kindOfFavoriteChange(change))),
      workspace.detach.onChange((change) => this.recordChange(...kindsOfTaskLinkChange(change))),
      workspace.integrations.onChange((change) =>
        this.recordChange(...kindsOfIntegrationChange(change)),
      ),
      // each committed page, with what it wrote
      sync.onProgress((progress) => this.recordChange(...progress.summary.changed)),
      // a source's cursor, status or error
      sync.onStatus(() => this.recordChange('externalSource')),
    ];
    return () => unsubscribes.forEach((unsubscribe) => unsubscribe());
  }
}

export function kindsOfArchiveChange({
  taskIds,
  projectIds,
  noteIds,
}: ArchiveChange): ChangedEntity[] {
  const kinds: ChangedEntity[] = [];
  if (taskIds.length > 0) kinds.push('task');
  if (projectIds.length > 0) kinds.push('project');
  if (noteIds.length > 0) kinds.push('note');
  return kinds;
}

const FAVORITE_KINDS = {
  tasks: 'task',
  projects: 'project',
  notes: 'note',
  events: 'event',
} as const satisfies Record<FavoriteChange['entityType'], ChangedEntity>;

export function kindOfFavoriteChange(change: FavoriteChange): ChangedEntity {
  return FAVORITE_KINDS[change.entityType];
}

export function kindsOfTaskLinkChange(change: TaskLinkChange): ChangedEntity[] {
  // rejected credentials move the integration to needs_reauth, which it reports itself
  if (change.type === 'credentials_rejected') return ['integration'];
  return ['task', ...change.changed];
}

export function kindsOfIntegrationChange(change: IntegrationChange): ChangedEntity[] {
  const kinds: ChangedEntity[] = ['integration', 'externalSource'];
  if (change.type === 'disconnected') kinds.push(...change.changed);
  return kinds;
}
