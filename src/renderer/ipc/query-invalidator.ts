import type { Query, QueryClient } from '@tanstack/react-query';
import type { inferRouterInputs } from '@trpc/server';
import type { ChangedEntity } from '@common/changes';
import type { AppEvents } from '@common/events';
import type { WorkspaceId } from '@common/ids';
import type { AppRouter } from '@main/ipc/router';
import type { EventClient } from './events';

// Keeps what the renderer has cached in step with main (docs/ipc/change-propagation-research.md).
// Main says which entities changed: in a call's response, which the link hands to `onChanged`
// before the call settles, and as `db.changes` for the rest. Each cached query whose route reads
// one of those entities is invalidated, and React Query refetches the ones on screen.

// The routers and their routes: { tasks: { list: …, get: … }, notes: { … }, … }
type Routes = inferRouterInputs<AppRouter>;

// Every router and route, by path: 'tasks', 'tasks.list'. Routers are one level deep.
export type RoutePath = {
  [R in keyof Routes & string]: R | `${R}.${keyof Routes[R] & string}`;
}[keyof Routes & string];

// The entities each route reads, by router, or by full path to override its router. A route listed
// nowhere is refetched on every change: correct by default, and a line here makes it cheaper.
// Read across entities wherever a view shows one entity's rows inside another's. Keyed by
// RoutePath, so a key naming no route (a typo, or a route renamed or removed) fails to compile.
export const ENTITIES_READ_BY_ROUTE: Readonly<
  Partial<Record<RoutePath, readonly ChangedEntity[]>>
> = {
  app: [],
  settings: ['settings'],
  workspaces: ['workspace'],
  workspace: [],
  // a task row shows its project, its linked event (in its calendar's colour) or note
  tasks: ['task', 'project', 'note', 'event', 'calendar'],
  // stats count tasks
  projects: ['project', 'task'],
  // a note row shows its project, its linked task or event (in its calendar's colour)
  notes: ['note', 'task', 'project', 'event', 'calendar'],
  // a note's markdown, from its file: only a change to the note changes it
  'notes.readContent': ['note'],
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
  // mutations only: imports report the tasks and notes they create
  transfer: [],
};

// Routers whose data belongs to no workspace, kept when the open one changes.
const ROUTERS_OUTSIDE_WORKSPACES = new Set<string>([
  'app',
  'settings',
  'workspaces',
] satisfies RoutePath[]);

// a tRPC query key starts with its path, split: [['tasks', 'list'], { input, type }]
function routePathOf(query: Query): string[] {
  const [path] = query.queryKey;
  return Array.isArray(path) ? path.map(String) : [];
}

// the table, looked up by a cached query's path, which may name no route
const ENTITIES_BY_PATH: Readonly<Record<string, readonly ChangedEntity[] | undefined>> =
  ENTITIES_READ_BY_ROUTE;

export function entitiesReadBy(path: readonly string[]): readonly ChangedEntity[] | 'everything' {
  return ENTITIES_BY_PATH[path.join('.')] ?? ENTITIES_BY_PATH[path[0]] ?? 'everything';
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
  // the workspace opening, from workspace.changed: set from the moment a switch starts until it
  // has opened or failed
  let openingWorkspaceId: WorkspaceId | null = null;

  const outsideWorkspaces = (query: Query) => ROUTERS_OUTSIDE_WORKSPACES.has(routePathOf(query)[0]);

  function invalidateQueriesReading(entities: readonly ChangedEntity[]): Promise<void> {
    // While a workspace opens, the old one's data is about to go and the new one's isn't there
    // yet: main has let go of the old one before its sync runs settle, and their last events still
    // come. Refetching its queries then (the old page is still mounted, hidden under the splash)
    // only fails with no_workspace_open, so only what belongs to no workspace refetches.
    const switching = openingWorkspaceId !== null;
    return queryClient.invalidateQueries({
      predicate: (query) => {
        if (switching && !outsideWorkspaces(query)) return false;
        const entitiesRead = entitiesReadBy(routePathOf(query));
        return (
          entitiesRead === 'everything' || entitiesRead.some((entity) => entities.includes(entity))
        );
      },
    });
  }

  // Cancels what is in flight for the old workspace and drops what was cached, refetching
  // nothing: a page still mounted is the old workspace's (hidden under the splash during a switch,
  // or about to be replaced), and must not fetch the new one's data. Removing a query doesn't
  // tell the hooks holding it, so that page doesn't render again; the next page's loaders fetch
  // its data from the workspace now open.
  async function dropWorkspaceData(): Promise<void> {
    const filters = { predicate: (query: Query) => !outsideWorkspaces(query) };
    await queryClient.cancelQueries(filters);
    queryClient.removeQueries(filters);
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
        events.on('workspace.changed', ({ id, opening }) => {
          openingWorkspaceId = opening;
          workspaceOpened(id).catch(onError);
        }),
        // a source's sync state (a run starting or ending, its error, its settings) and an
        // account's status change outside any call: what reads them (sync.status, the sidebar's
        // sync line, Integrations) refetches. The rows a run writes come as db.changes.
        events.on('sources.changed', () => {
          onChanged(['externalSource']).catch(onError);
        }),
        events.on('integrations.changed', () => {
          onChanged(['integration', 'externalSource']).catch(onError);
        }),
      ];
      return () => unsubscribes.forEach((unsubscribe) => unsubscribe());
    },
  };
}
