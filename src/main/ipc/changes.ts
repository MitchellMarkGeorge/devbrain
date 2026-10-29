import { AsyncLocalStorage } from 'node:async_hooks';
import type { ChangedEntity } from '@common/changes';
import type { AppEventName, AppEvents } from '@common/events';
import type { DevBrain, Workspace } from '@main/core';
import type { ArchiveChange } from '@main/core/archive/service';
import type { FavoriteChange } from '@main/core/favorites/service';
import type { TaskLinkChange } from '@main/core/integrations/detach';
import type { IntegrationChange } from '@main/core/integrations/service';
import type { ChangeRecorder } from './server';

// Sends an event to every window but `except`, the one a call came from, if given. The hub never
// sees a window: src/main/index.ts sends through webContents.
export type PushEvent = <K extends AppEventName>(
  name: K,
  payload: AppEvents[K],
  except?: unknown,
) => void;

// How long the hub gathers changes made outside any call before sending them as one `db.changes`,
// so a sync run's pages, or a cascade of events, refetch once.
export const PUSH_DELAY_MS = 50;

interface CallScope {
  record(...entities: ChangedEntity[]): void;
  // the call's window, which gets these in its response rather than as an event
  origin: unknown;
  // set once the call has answered: what it started and still runs (a sync run after a connect)
  // is pushed from then on
  done: boolean;
}

/**
 * Turns what core changes into the kinds of rows the renderer refetches for
 * (docs/ipc/change-propagation-research.md). It listens to every service of the open workspace,
 * following a switch. A change made during an IPC call goes in that call's `changed`, so the
 * renderer refetches before the call settles; every other change (sync, work a call left running)
 * is pushed to the windows as `db.changes`, gathered for PUSH_DELAY_MS. A call's changes are also
 * pushed to the other windows.
 */
export class ChangeHub {
  private readonly calls = new AsyncLocalStorage<CallScope>();
  private readonly pending = new Set<ChangedEntity>();
  private timer: ReturnType<typeof setTimeout> | null = null;
  private stopWatching: (() => void) | null = null;

  constructor(private readonly push: PushEvent) {}

  /** Follows `devBrain`'s open workspace from now on. Returns the function that stops. */
  watch(devBrain: Pick<DevBrain, 'currentWorkspace' | 'workspaces'>): () => void {
    this.stopWatching?.();
    const current = devBrain.currentWorkspace;
    let detach = current ? this.attach(current) : () => {};
    const unsubscribe = devBrain.workspaces.onChange((change) => {
      detach();
      detach = change.type === 'opened' ? this.attach(change.workspace) : () => {};
      const id = change.type === 'opened' ? change.workspace.info.id : null;
      this.record('workspace');
      this.push('workspace.changed', { id }, this.liveScope()?.origin);
    });
    this.stopWatching = () => {
      unsubscribe();
      detach();
      this.stopWatching = null;
    };
    return this.stopWatching;
  }

  /**
   * Runs one IPC call. Changes made in it, by core or through the recorder `run` gets, go to
   * `changes`, the call's own; once it has settled they are pushed to the other windows.
   */
  async track<T>(
    origin: unknown,
    changes: ChangeRecorder,
    run: (changes: ChangeRecorder) => Promise<T>,
  ): Promise<T> {
    const changed = new Set<ChangedEntity>();
    const scope: CallScope = {
      origin,
      done: false,
      record: (...entities) => {
        entities.forEach((entity) => changed.add(entity));
        changes.record(...entities);
      },
    };
    try {
      return await this.calls.run(scope, () => run({ record: scope.record }));
    } finally {
      scope.done = true;
      if (changed.size > 0) this.push('db.changes', { entities: [...changed] }, origin);
    }
  }

  /** Records a change: in the running call's response, or in the next `db.changes`. */
  record(...entities: ChangedEntity[]): void {
    if (entities.length === 0) return;
    const scope = this.liveScope();
    if (scope) {
      scope.record(...entities);
      return;
    }
    entities.forEach((entity) => this.pending.add(entity));
    this.timer ??= setTimeout(() => this.flush(), PUSH_DELAY_MS);
  }

  /** Sends what is waiting now. */
  flush(): void {
    if (this.timer !== null) clearTimeout(this.timer);
    this.timer = null;
    if (this.pending.size === 0) return;
    const entities = [...this.pending];
    this.pending.clear();
    this.push('db.changes', { entities });
  }

  // the call this code runs for, while it has not answered
  private liveScope(): CallScope | undefined {
    const scope = this.calls.getStore();
    return scope && !scope.done ? scope : undefined;
  }

  // listens to every service of `workspace` that changes rows; returns the function that stops
  private attach(workspace: Workspace): () => void {
    const { sync } = workspace;
    const unsubscribes = [
      workspace.tasks.onChange(() => this.record('task')),
      workspace.projects.onChange(() => this.record('project')),
      workspace.notes.onChange(() => this.record('note')),
      workspace.events.onChange(() => this.record('event')),
      workspace.calendars.onChange(() => this.record('calendar')),
      workspace.archive.onChange((change) => this.record(...archiveKinds(change))),
      workspace.favorites.onChange((change) => this.record(favoriteKind(change))),
      workspace.detach.onChange((change) => this.record(...taskLinkKinds(change))),
      workspace.integrations.onChange((change) => this.record(...integrationKinds(change))),
      // each committed page, with what it wrote
      sync.onProgress((progress) => this.record(...progress.summary.changed)),
      // a source's cursor, status or error
      sync.onStatus(() => this.record('externalSource')),
    ];
    return () => unsubscribes.forEach((unsubscribe) => unsubscribe());
  }
}

export function archiveKinds({ taskIds, projectIds, noteIds }: ArchiveChange): ChangedEntity[] {
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

export function favoriteKind(change: FavoriteChange): ChangedEntity {
  return FAVORITE_KINDS[change.entityType];
}

export function taskLinkKinds(change: TaskLinkChange): ChangedEntity[] {
  // rejected credentials move the integration to needs_reauth, which it reports itself
  if (change.type === 'credentials_rejected') return ['integration'];
  return ['task', ...change.changed];
}

export function integrationKinds(change: IntegrationChange): ChangedEntity[] {
  const kinds: ChangedEntity[] = ['integration', 'externalSource'];
  if (change.type === 'disconnected') kinds.push(...change.changed);
  return kinds;
}
