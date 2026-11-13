import { queryOptions, type InfiniteData, type QueryClient } from '@tanstack/react-query';
import type { ProjectId, TaskId } from '@common/ids';
import {
  LinkState,
  type Event,
  type ExternalRef,
  type NoteListItem,
  type Page,
  type TaskListItem,
} from '@common/types';
import { ipc, trpc } from '../../ipc';
import type { TaskListInput } from './search';

// The tasks page's reads, and the in-place patch its optimistic writes use
// (docs/renderer/implementation-plan.md, "How the infinite lists work" and "Mutations").

/** At most this many pages stay loaded per list; scrolling back past them reloads the earlier ones. */
const MAX_PAGES = 10;

/** One infinite list of tasks (`tasks.list`), paged by core's cursor. */
export function taskListQuery(input: TaskListInput) {
  return trpc.tasks.list.infiniteQueryOptions(input, {
    getNextPageParam: (page) => page.nextCursor,
    maxPages: MAX_PAGES,
  });
}

/**
 * One group of the group view: the first `pages` pages of `tasks.list`, as one page. "Show more"
 * asks for a page more. A plain query, not an infinite one, so the view holds every group's in one
 * `useQueries`; its key starts with `tasks.list`'s, so a change to tasks refetches it.
 */
export function groupTasksQuery(input: TaskListInput, pages: number) {
  return queryOptions({
    queryKey: [...trpc.tasks.list.queryKey(input), { pages }],
    queryFn: async (): Promise<Page<TaskListItem>> => {
      const items: TaskListItem[] = [];
      let cursor: string | null = null;
      for (let page = 0; page < pages; page++) {
        const next = await ipc.tasks.list.query({ ...input, cursor });
        items.push(...next.items);
        cursor = next.nextCursor;
        if (cursor === null) break;
      }
      return { items, nextCursor: cursor };
    },
  });
}

/** A task's direct subtasks, as one infinite list. */
export function subtasksQuery(id: TaskId) {
  return trpc.tasks.subtasks.infiniteQueryOptions(
    { id, limit: 100 },
    { getNextPageParam: (page) => page.nextCursor, maxPages: MAX_PAGES },
  );
}

/**
 * The task as a loaded list already holds it (a board column, a list or a group), for a sheet to
 * draw at once while `tasks.get` loads the task itself.
 */
export function listedTask(queryClient: QueryClient, id: TaskId): TaskListItem | undefined {
  const lists = queryClient.getQueriesData<InfiniteData<Page<TaskListItem>>>({
    queryKey: trpc.tasks.list.pathKey(),
  });
  for (const [, data] of lists) {
    for (const page of data?.pages ?? []) {
      const task = page.items.find((item) => item.id === id);
      if (task) return task;
    }
  }
  return undefined;
}

/**
 * A note as a loaded `notes.list` holds it, to draw while `notes.get` loads it: a picker's (one
 * page) or the Notes page's (an infinite list's pages).
 */
export function listedNote(queryClient: QueryClient, id: string): NoteListItem | undefined {
  for (const [, data] of queryClient.getQueriesData<
    Page<NoteListItem> | InfiniteData<Page<NoteListItem>>
  >({ queryKey: trpc.notes.list.pathKey() })) {
    const pages = data === undefined ? [] : 'pages' in data ? data.pages : [data];
    for (const page of pages) {
      const note = page.items.find((item) => item.id === id);
      if (note) return note;
    }
  }
  return undefined;
}

/** An event as a loaded calendar range holds it (a picker's), to draw while `events.get` loads. */
export function listedEvent(queryClient: QueryClient, id: string): Event | undefined {
  for (const [, data] of queryClient.getQueriesData<Event[]>({
    queryKey: trpc.events.listForCalendar.pathKey(),
  })) {
    const event = data?.find((item) => item.id === id);
    if (event) return event;
  }
  return undefined;
}

/**
 * Starts loading what the task sheet shows (the task and its subtasks) as a card is pointed at or
 * focused, so a click opens it drawn.
 */
export function prefetchTaskSheet(queryClient: QueryClient, id: TaskId) {
  // not again while what was loaded is a few seconds old: a change to it refetches it anyway
  const staleTime = 10_000;
  void queryClient.prefetchQuery({ ...trpc.tasks.get.queryOptions({ id }), staleTime });
  void queryClient.prefetchInfiniteQuery({ ...subtasksQuery(id), staleTime });
}

/**
 * The tasks as a list fixed to one project draws them (a project's page, or the project filter):
 * without that project's pill on every row, as it says nothing there.
 */
export function withoutProjectPill<T extends Pick<TaskListItem, 'project'>>(
  tasks: T[],
  project: ProjectId | 'none' | undefined,
): T[] {
  if (!project || project === 'none') return tasks;
  return tasks.map((task) => (task.project?.id === project ? { ...task, project: null } : task));
}

/** A synced task: its provider owns its fields (status, priority, dates, project, title). */
export function isSynced(task: { external?: Pick<ExternalRef, 'state'> | null }): boolean {
  return task.external?.state === LinkState.SYNCED;
}

/** What an optimistic write changes on a task, as every cached read shows it. */
export type TaskPatch = Partial<
  Pick<
    TaskListItem,
    | 'status'
    | 'priority'
    | 'dueDate'
    | 'startDate'
    | 'favoritedAt'
    | 'projectId'
    | 'linkedEventId'
    | 'linkedNoteId'
  >
>;

type Patcher = (value: unknown) => unknown;

// Patches the task wherever a cached read holds it: an infinite list's pages, a page's items, a
// favorite's or recent's entity, or the task itself. Never adds or removes a row.
function patchValue(ids: ReadonlySet<string>, patch: TaskPatch): Patcher {
  const visit: Patcher = (value) => {
    if (Array.isArray(value)) {
      let changed = false;
      const next = value.map((item) => {
        const patched = visit(item);
        if (patched !== item) changed = true;
        return patched;
      });
      return changed ? next : value;
    }
    if (value === null || typeof value !== 'object') return value;
    const record = value as Record<string, unknown>;
    if (typeof record.id === 'string' && ids.has(record.id)) return { ...record, ...patch };
    for (const key of ['pages', 'items', 'entity'] as const) {
      if (key in record) {
        const inner = visit(record[key]);
        if (inner !== record[key]) return { ...record, [key]: inner };
      }
    }
    return value;
  };
  return visit;
}

const PATCHED_ROUTERS = new Set(['tasks', 'favorites', 'recents']);

/** The cached reads a task patch can reach: `tasks.*`, `favorites.*` and `recents.*`. */
function patchedQueries(query: { queryKey: readonly unknown[] }): boolean {
  const [path] = query.queryKey;
  return Array.isArray(path) && PATCHED_ROUTERS.has(String(path[0]));
}

/**
 * Patches the tasks in every cached read, first cancelling what is in flight (so a refetch that
 * started before the write can't overwrite the patch), and returns the function that puts the
 * cache back, for a failed write. The write's own `changed` refetches the real rows after it.
 */
export async function patchTaskInCaches(
  queryClient: QueryClient,
  ids: readonly TaskId[],
  patch: TaskPatch,
): Promise<() => void> {
  const snapshot = queryClient.getQueriesData({ predicate: patchedQueries });
  const patched = patchValue(new Set(ids), patch);
  // at once, so the change shows on the frame it was made; then again once what was in flight is
  // cancelled, in case a refetch landed in between
  queryClient.setQueriesData({ predicate: patchedQueries }, patched);
  await queryClient.cancelQueries({ predicate: patchedQueries });
  queryClient.setQueriesData({ predicate: patchedQueries }, patched);
  return () => {
    for (const [key, data] of snapshot) queryClient.setQueryData(key, data);
  };
}
