import type { Project } from '@common/types';
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
