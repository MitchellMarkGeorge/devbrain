import { TaskStatus, type Project } from '@common/types';
import { trpc } from '../../ipc';
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
export const OVERVIEW_SECTION_SIZE = 5;

/**
 * An Overview section's tasks: the project's tasks of one status, the soonest due first (the
 * latest edited first for Completed), as many as the section shows. A plain query whose key
 * starts with `tasks.list`'s, so a change to tasks refetches it.
 */
export function overviewTasksQuery(projectId: Project['id'], status: TaskStatus) {
  const sort =
    status === TaskStatus.COMPLETED
      ? ({ sortBy: 'updatedAt', direction: 'desc' } as const)
      : ({ sortBy: 'dueDate', direction: 'asc' } as const);
  return trpc.tasks.list.queryOptions({
    filter: { projectId, status },
    sort,
    limit: OVERVIEW_SECTION_SIZE,
  });
}

/** The Overview's latest notes: the three most recently edited. */
export function overviewNotesQuery(projectId: Project['id']) {
  return trpc.notes.list.queryOptions({
    filter: { projectId },
    sort: { sortBy: 'updatedAt', direction: 'desc' },
    limit: 3,
  });
}
