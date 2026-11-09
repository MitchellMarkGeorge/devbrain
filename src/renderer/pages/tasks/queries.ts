import type { QueryClient } from '@tanstack/react-query';
import type { TaskId } from '@common/ids';
import { LinkState, type ExternalRef, type TaskListItem } from '@common/types';
import { trpc } from '../../ipc';
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

/** A task's direct subtasks, as one infinite list. */
export function subtasksQuery(id: TaskId) {
  return trpc.tasks.subtasks.infiniteQueryOptions(
    { id, limit: 100 },
    { getNextPageParam: (page) => page.nextCursor, maxPages: MAX_PAGES },
  );
}

/** A synced task: its provider owns its fields (status, priority, dates, project, title). */
export function isSynced(task: { external?: Pick<ExternalRef, 'state'> | null }): boolean {
  return task.external?.state === LinkState.SYNCED;
}

/** What an optimistic write changes on a task, as every cached read shows it. */
export type TaskPatch = Partial<
  Pick<TaskListItem, 'status' | 'priority' | 'dueDate' | 'startDate' | 'favoritedAt' | 'projectId'>
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
  await queryClient.cancelQueries({ predicate: patchedQueries });
  const snapshot = queryClient.getQueriesData({ predicate: patchedQueries });
  queryClient.setQueriesData({ predicate: patchedQueries }, patchValue(new Set(ids), patch));
  return () => {
    for (const [key, data] of snapshot) queryClient.setQueryData(key, data);
  };
}
