import { notFound } from '@tanstack/react-router';
import { DateTime } from 'luxon';
import type { TaskId } from '@common/ids';
import { isId } from '@common/ids';
import type { RouterContext } from '../../router';
import { ipcErrorCode } from '../../workspace/errors';
import { groupDefs, PRIMED_GROUPS } from './groups';
import { taskListQuery, subtasksQuery } from './queries';
import { resolveTasksSearch, taskListInput, type TasksSearch } from './search';

// What the tasks routes load before their first frame (routes/app/$workspaceId/tasks/): they only
// prime React Query's cache, which the pages read.

/** The start of today: the day the page's due filters are on (the same key the page builds). */
export function today(): Date {
  return DateTime.now().startOf('day').toJSDate();
}

/** The filters a list's loader depends on: everything but the sheet, so opening it reloads nothing. */
export function tasksLoaderDeps({ search }: { search: TasksSearch }): TasksSearch {
  return { ...search, open: undefined };
}

/**
 * The list page: the settings (its defaults), and the view's first data: the list's first page,
 * or the group view's projects and its first groups. Switching view runs this again, and the old
 * view stays up until it's done, so the new one draws whole, never empty first.
 */
export async function loadTasks({ queryClient, trpc }: RouterContext, search: TasksSearch) {
  const settings = await queryClient.query({
    ...trpc.settings.get.queryOptions(),
    staleTime: 'static',
  });
  const resolved = resolveTasksSearch(search, settings);
  if (resolved.view === 'list') {
    await queryClient.infiniteQuery({
      ...taskListQuery(taskListInput(resolved, today())),
      staleTime: 'static',
    });
  }
  if (resolved.view === 'group') {
    const projects =
      resolved.groupBy === 'project'
        ? (
            await queryClient.query({
              ...trpc.projects.list.queryOptions({ limit: 200 }),
              staleTime: 'static',
            })
          ).items
        : [];
    const defs = groupDefs(resolved, today(), projects).slice(0, PRIMED_GROUPS);
    await Promise.all(
      defs.map((def) =>
        queryClient.infiniteQuery({
          ...taskListQuery(taskListInput(resolved, today(), def.filter)),
          staleTime: 'static',
        }),
      ),
    );
  }
}

/** The task page's id, checked: anything but a task id is no page. */
export const parseTaskParams = {
  parse: ({ taskId }: { taskId: string }): { taskId: TaskId } => {
    if (!isId('task', taskId)) throw notFound();
    return { taskId };
  },
  stringify: ({ taskId }: { taskId: TaskId }) => ({ taskId }),
};

/** The task page: the task (a missing one is the route's not-found), and its subtasks after. */
export async function loadTask({ queryClient, trpc }: RouterContext, id: TaskId) {
  try {
    await queryClient.query({ ...trpc.tasks.get.queryOptions({ id }), staleTime: 'static' });
  } catch (error) {
    if (ipcErrorCode(error) === 'not_found') throw notFound();
    throw error;
  }
  void queryClient.infiniteQuery({ ...subtasksQuery(id), staleTime: 'static' }).catch(() => {});
}
