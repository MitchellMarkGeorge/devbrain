import type { Query, QueryClient } from '@tanstack/react-query';
import type { ChangedEntity } from '@common/changes';
import type { AppEvents } from '@common/events';
import type { WorkspaceId } from '@common/ids';
import type { EventClient } from './events';

// Keeps what the renderer has cached in step with main (docs/ipc/change-propagation-research.md).
// Main says which entities changed: in a call's response, which the link hands to `onChanged`
// before the call settles, and as `db.changes` for the rest. Each cached query whose route reads
// one of those entities is invalidated, and React Query refetches the ones on screen.

// The entities each route reads, by router, or by full path to override its router. A route listed
// nowhere is refetched on every change: correct by default, and a line here makes it cheaper.
// Read across entities wherever a view shows one entity's rows inside another's.
export const ENTITIES_READ_BY_ROUTE: Readonly<Record<string, readonly ChangedEntity[]>> = {
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
  // a disconnect turns its calendars into local ones
  calendars: ['calendar', 'externalSource'],
  favorites: ['task', 'project', 'note', 'event'],
  // titles come from the entities, so an edit or archive changes the list too
  recents: ['recent', 'task', 'project', 'note', 'event'],
  archive: ['task', 'project', 'note'],
  search: ['task', 'project', 'note', 'event'],
  integrations: ['integration', 'externalSource'],
  // counts the synced rows a disconnect would delete or keep, and those notes point at
  'integrations.previewDisconnect': [
    'integration',
    'externalSource',
    'task',
    'project',
    'event',
    'note',
  ],
  sync: ['integration', 'externalSource'],
};

// Routers whose data belongs to no workspace, kept when the open one changes.
const ROUTERS_OUTSIDE_WORKSPACES = new Set(['app', 'settings', 'workspaces']);

// a tRPC query key starts with its path, split: [['tasks', 'list'], { input, type }]
function routePathOf(query: Query): string[] {
  const [path] = query.queryKey;
  return Array.isArray(path) ? path.map(String) : [];
}

export function entitiesReadBy(path: readonly string[]): readonly ChangedEntity[] | 'everything' {
  return ENTITIES_READ_BY_ROUTE[path.join('.')] ?? ENTITIES_READ_BY_ROUTE[path[0]] ?? 'everything';
}

export interface QueryInvalidator {
  /** Invalidates the queries reading these entities; resolves once the active ones refetched. */
  onChanged(entities: readonly ChangedEntity[]): Promise<void>;
  /** Drops what was cached for another workspace when `id` is not the one known to be open. */
  workspaceOpened(id: WorkspaceId | null): Promise<void>;
  /** Follows main's events; returns the function that stops. */
  listen(events: EventClient<AppEvents>): () => void;
}

export interface QueryInvalidatorOptions {
  queryClient: QueryClient;
  // where an event's failed refetch goes; the console by default
  onError?: (error: unknown) => void;
}

export function createQueryInvalidator(options: QueryInvalidatorOptions): QueryInvalidator {
  const { queryClient } = options;
  const onError = options.onError ?? ((error: unknown) => console.error(error));
  // the workspace whose data is cached; unknown until main first says
  let cachedWorkspaceId: WorkspaceId | null | undefined;

  function invalidateQueriesReading(entities: readonly ChangedEntity[]): Promise<void> {
    return queryClient.invalidateQueries({
      predicate: (query) => {
        const entitiesRead = entitiesReadBy(routePathOf(query));
        return (
          entitiesRead === 'everything' || entitiesRead.some((entity) => entities.includes(entity))
        );
      },
    });
  }

  // cancels what is in flight for the old workspace, clears it, and refetches what is on screen
  function dropWorkspaceData(): Promise<void> {
    return queryClient.resetQueries({
      predicate: (query) => !ROUTERS_OUTSIDE_WORKSPACES.has(routePathOf(query)[0]),
    });
  }

  async function workspaceOpened(id: WorkspaceId | null): Promise<void> {
    if (id === cachedWorkspaceId) return;
    cachedWorkspaceId = id;
    // the old workspace's data goes, and the workspace queries (which one is open) refetch
    await Promise.all([dropWorkspaceData(), invalidateQueriesReading(['workspace'])]);
  }

  // `workspace` here only refetches the workspace list: which workspace is open comes from
  // `workspace.changed` alone, through workspaceOpened
  async function onChanged(entities: readonly ChangedEntity[]): Promise<void> {
    if (entities.length === 0) return;
    await invalidateQueriesReading(entities);
  }

  return {
    onChanged,
    workspaceOpened,
    listen(events) {
      const unsubscribes = [
        events.on('db.changes', ({ entities }) => {
          onChanged(entities).catch(onError);
        }),
        events.on('workspace.changed', ({ id }) => {
          workspaceOpened(id).catch(onError);
        }),
      ];
      return () => unsubscribes.forEach((unsubscribe) => unsubscribe());
    },
  };
}
