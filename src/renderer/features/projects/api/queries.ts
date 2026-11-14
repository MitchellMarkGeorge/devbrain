import { TaskStatus, type Project } from '@common/types';
import { trpc } from '@renderer/ipc';
import type { ProjectListInput } from './search';

// The projects pages' reads (docs/renderer/implementation-plan.md, "How the infinite lists work").

/** At most this many pages stay loaded; scrolling back past them reloads the earlier ones. */
const MAX_PAGES = 10;

/** The projects list (`projects.list`), each with its task stats, paged by core's cursor. */
export function projectListQuery(input: ProjectListInput) {
  return trpc.projects.list.infiniteQueryOptions(input, {
    getNextPageParam: (page) => page.nextCursor,
    maxPages: MAX_PAGES,
  });
}

/** The notes of a project, newest edit first, for its Notes tab. */
export function projectNotesQuery(projectId: Project['id']) {
  return trpc.notes.list.infiniteQueryOptions(
    { filter: { projectId }, sort: { sortBy: 'updatedAt', direction: 'desc' }, limit: 100 },
    { getNextPageParam: (page) => page.nextCursor, maxPages: MAX_PAGES },
  );
}

/** How many tasks an Overview section shows; the rest are a click away in the Tasks tab. */
export const OVERVIEW_OPEN_SIZE = 8;
export const OVERVIEW_DONE_SIZE = 3;

/**
 * The Overview's open tasks: the project's not started and in-progress tasks, the soonest due
 * first, as many as it shows. A plain query whose key starts with `tasks.list`'s, so a change to
 * tasks refetches it.
 */
export function overviewOpenTasksQuery(projectId: Project['id']) {
  return trpc.tasks.list.queryOptions({
    filter: { projectId, excludeClosed: true },
    sort: { sortBy: 'dueDate', direction: 'asc' },
    limit: OVERVIEW_OPEN_SIZE,
  });
}

/** The Overview's recently completed tasks: the latest edited first. */
export function overviewDoneTasksQuery(projectId: Project['id']) {
  return trpc.tasks.list.queryOptions({
    filter: { projectId, status: TaskStatus.COMPLETED },
    sort: { sortBy: 'updatedAt', direction: 'desc' },
    limit: OVERVIEW_DONE_SIZE,
  });
}

/** The Overview's latest notes: the five most recently edited. */
export function overviewNotesQuery(projectId: Project['id']) {
  return trpc.notes.list.queryOptions({
    filter: { projectId },
    sort: { sortBy: 'updatedAt', direction: 'desc' },
    limit: 5,
  });
}
