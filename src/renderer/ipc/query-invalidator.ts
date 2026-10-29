import type { Query, QueryClient } from '@tanstack/react-query';
import type { ChangedEntity } from '@common/changes';
import type { AppEvents } from '@common/events';
import type { WorkspaceId } from '@common/ids';
import type { EventClient } from './events';

// Keeps what the renderer has cached in step with main (docs/ipc/change-propagation-research.md).
// Main says which kinds of rows changed: in a call's response, which the link hands to `onChanged`
// before the call settles, and as `db.changes` for the rest. Each cached query whose route reads
// one of those kinds is invalidated, and React Query refetches the ones on screen.

// The kinds each route reads, by router, or by full path to override its router. A route listed
// nowhere is refetched on every change: correct by default, and a line here makes it cheaper.
// Read across kinds wherever a view shows one kind's rows inside another's.
export const READS: Readonly<Record<string, readonly ChangedEntity[]>> = {
  app: [],
  settings: [],
  workspaces: ['workspace'],
  workspace: [],
  // a task shows its project
  tasks: ['task', 'project'],
  // stats count tasks
  projects: ['project', 'task'],
  notes: ['note', 'task', 'project'],
  // the calendar view shows only visible calendars
  events: ['event', 'calendar'],
  calendars: ['calendar'],
  favorites: ['task', 'project', 'note', 'event'],
  archive: ['task', 'project', 'note'],
  search: ['task', 'project', 'note', 'event'],
  integrations: ['integration', 'externalSource'],
  sync: ['integration', 'externalSource'],
};

// Routers whose data belongs to no workspace, kept when the open one changes.
const APP_WIDE = new Set(['app', 'settings', 'workspaces']);

// a tRPC query key starts with its path, split: [['tasks', 'list'], { input, type }]
function pathOf(query: Query): string[] {
  const [path] = query.queryKey;
  return Array.isArray(path) ? path.map(String) : [];
}

export function readsOf(path: readonly string[]): readonly ChangedEntity[] | 'everything' {
  return READS[path.join('.')] ?? READS[path[0]] ?? 'everything';
}

export interface QueryInvalidator {
  /** Invalidates the queries reading what changed; resolves once the active ones refetched. */
  onChanged(changed: readonly ChangedEntity[]): Promise<void>;
  /** Drops what was cached for another workspace when `id` is not the one known to be open. */
  workspaceOpened(id: WorkspaceId | null): Promise<void>;
  /** Follows main's events; returns the function that stops. */
  listen(events: EventClient<AppEvents>): () => void;
}

export interface QueryInvalidatorOptions {
  queryClient: QueryClient;
  // the workspace open now, asked when a call reports `workspace`
  currentWorkspaceId: () => Promise<WorkspaceId | null>;
  // where an event's failed refetch goes; the console by default
  onError?: (error: unknown) => void;
}

export function createQueryInvalidator(options: QueryInvalidatorOptions): QueryInvalidator {
  const { queryClient } = options;
  const onError = options.onError ?? ((error: unknown) => console.error(error));
  // the workspace whose data is cached; unknown until main first says
  let openId: WorkspaceId | null | undefined;

  function invalidate(changed: readonly ChangedEntity[]): Promise<void> {
    return queryClient.invalidateQueries({
      predicate: (query) => {
        const reads = readsOf(pathOf(query));
        return reads === 'everything' || reads.some((kind) => changed.includes(kind));
      },
    });
  }

  async function workspaceOpened(id: WorkspaceId | null): Promise<void> {
    if (id === openId) return;
    openId = id;
    // cancels what is in flight for the old one, clears it, and refetches what is on screen
    await queryClient.resetQueries({ predicate: (query) => !APP_WIDE.has(pathOf(query)[0]) });
  }

  async function onChanged(changed: readonly ChangedEntity[]): Promise<void> {
    if (changed.length === 0) return;
    await invalidate(changed);
    if (!changed.includes('workspace')) return;
    // a switch, or only the list changing: which one is open now says
    let id: WorkspaceId | null | undefined;
    try {
      id = await options.currentWorkspaceId();
    } catch (error) {
      onError(error);
      id = undefined;
    }
    if (id === undefined) {
      // not knowing which is open, nothing cached can be trusted
      openId = undefined;
      await queryClient.resetQueries({ predicate: (query) => !APP_WIDE.has(pathOf(query)[0]) });
    } else {
      await workspaceOpened(id);
    }
  }

  return {
    onChanged,
    workspaceOpened,
    listen(events) {
      const off = [
        events.on('db.changes', ({ entities }) => {
          onChanged(entities).catch(onError);
        }),
        events.on('workspace.changed', ({ id }) => {
          workspaceOpened(id).catch(onError);
        }),
      ];
      return () => off.forEach((unsubscribe) => unsubscribe());
    },
  };
}
