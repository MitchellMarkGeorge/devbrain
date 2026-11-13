import { notFound } from '@tanstack/react-router';
import type { ProjectId } from '@common/ids';
import { isId } from '@common/ids';
import type { RouterContext } from '../../router';
import { ipcErrorCode } from '../../workspace/errors';
import { loadTasks } from '../tasks/loaders';
import {
  overviewDoneTasksQuery,
  overviewNotesQuery,
  overviewOpenTasksQuery,
  projectListQuery,
  projectNotesQuery,
} from './queries';
import {
  projectListInput,
  projectTasksSearch,
  resolveProjectsSearch,
  type ProjectSearch,
  type ProjectsSearch,
} from './search';

// What the projects routes load before their first frame (routes/app/$workspaceId/projects/):
// they only prime React Query's cache, which the pages read.

/** The list page: the first page of projects, with their stats, for the filters in the URL. */
export async function loadProjects({ queryClient }: RouterContext, search: ProjectsSearch) {
  await queryClient.infiniteQuery({
    ...projectListQuery(projectListInput(resolveProjectsSearch(search))),
    staleTime: 'static',
  });
}

/** The project page's id, checked: anything but a project id is no page. */
export const parseProjectParams = {
  parse: ({ projectId }: { projectId: string }): { projectId: ProjectId } => {
    if (!isId('project', projectId)) throw notFound();
    return { projectId };
  },
  stringify: ({ projectId }: { projectId: ProjectId }) => ({ projectId }),
};

/** What the project page's loader depends on: everything but the board's sheet. */
export function projectLoaderDeps({ search }: { search: ProjectSearch }): ProjectSearch {
  return { ...search, open: undefined };
}

/**
 * The project page: the project (a missing one is the route's not-found) and its stats, then the
 * tab's first data: the Overview's open and recently completed tasks and its latest notes, the Tasks tab's view (as the tasks page loads it), or
 * the notes.
 */
export async function loadProject(context: RouterContext, id: ProjectId, search: ProjectSearch) {
  const { queryClient, trpc } = context;
  try {
    await queryClient.query({ ...trpc.projects.get.queryOptions({ id }), staleTime: 'static' });
  } catch (error) {
    if (ipcErrorCode(error) === 'not_found') throw notFound();
    throw error;
  }
  void queryClient
    .query({ ...trpc.projects.stats.queryOptions({ id }), staleTime: 'static' })
    .catch(() => {});
  const tab = search.tab ?? 'overview';
  if (tab === 'notes') {
    await queryClient.infiniteQuery({ ...projectNotesQuery(id), staleTime: 'static' });
  } else if (tab === 'tasks') {
    await loadTasks(context, projectTasksSearch(search, id));
  } else {
    await Promise.all([
      queryClient.query({ ...overviewOpenTasksQuery(id), staleTime: 'static' }),
      queryClient.query({ ...overviewDoneTasksQuery(id), staleTime: 'static' }),
      queryClient.query({ ...overviewNotesQuery(id), staleTime: 'static' }),
    ]);
  }
}
