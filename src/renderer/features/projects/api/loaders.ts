import { noop } from '@tanstack/react-query';
import { notFound } from '@tanstack/react-router';
import type { ProjectId } from '@common/ids';
import { isId } from '@common/ids';
import type { RouterContext } from '@renderer/app/router';
import { primeContent, projectContentQuery } from '@renderer/shared/api/content';
import { ipcErrorCode } from '@renderer/shared/lib/workspace/errors';
import { loadTasks } from '@renderer/features/tasks/api/loaders';
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
 * The project page: the project (a missing one is the route's not-found), its description's
 * content query, primed from it, and its stats, then the tab's first data: the Overview's open and recently
 * completed tasks and its latest notes, the Tasks tab's view (as the tasks page loads it), or the
 * notes.
 */
export async function loadProject(context: RouterContext, id: ProjectId, search: ProjectSearch) {
  const { queryClient, trpc } = context;
  const projectOptions = trpc.projects.get.queryOptions({ id });
  let project;
  try {
    project = await queryClient.query({ ...projectOptions, staleTime: 'static' });
  } catch (error) {
    if (ipcErrorCode(error) === 'not_found') throw notFound();
    throw error;
  }
  await primeContent(
    queryClient,
    projectContentQuery(id),
    projectOptions.queryKey,
    project.description,
  );
  queryClient
    .query({ ...trpc.projects.stats.queryOptions({ id }), staleTime: 'static' })
    .catch(noop);
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
