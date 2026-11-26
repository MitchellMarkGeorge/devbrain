import { useCallback, useMemo } from 'react';
import { useSuspenseQuery } from '@tanstack/react-query';
import type { Project } from '@common/types';
import { trpc } from '@renderer/ipc';
import { resolveTasksSearch, type TasksSearch } from '@renderer/features/tasks/api/search';
import {
  TasksSearchProvider,
  type SetTasksSearchOptions,
  type TasksSearchState,
} from '@renderer/features/tasks/hooks/use-tasks-search';
import { TasksView } from '@renderer/features/tasks/components/views/TasksView';
import { projectRoute } from '../../api/route-api';
import { keepTabSteps, nextTabStep, projectTasksSearch } from '../../api/search';

/**
 * The Tasks tab (Figma `7159:13218`): the tasks page's views (list, grouped or board, with Filter,
 * Sort and New Task) over this project's tasks. Its params live in the project page's URL beside
 * `tab`; the project is fixed, so the Filter menu has no project and New Task files the task here.
 */
export function ProjectTasksTab({ project }: { project: Project }) {
  const search = projectRoute.useSearch();
  const navigate = projectRoute.useNavigate();
  const settings = useSuspenseQuery(trpc.settings.get.queryOptions()).data;
  const setSearch = useCallback(
    (patch: Partial<TasksSearch>, options: SetTasksSearchOptions = {}) => {
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const { project: _fixed, ...rest } = patch;
      navigate({
        search: (previous) => ({ ...previous, ...rest }),
        replace: !options.push,
        // the tab's place among the page's entries stays with it; a sheet opened is one more
        state: (previous) =>
          options.openedSheet
            ? { ...previous, ...nextTabStep(previous), openedSheet: true }
            : keepTabSteps(previous),
      });
    },
    [navigate],
  );
  const state = useMemo<TasksSearchState>(() => {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { tab, ...tasks } = search;
    return {
      search: tasks,
      resolved: resolveTasksSearch(projectTasksSearch(search, project.id), settings),
      setSearch,
      project: project.id,
    };
  }, [search, project.id, settings, setSearch]);
  return (
    <TasksSearchProvider value={state}>
      <TasksView showProjectPill={false} />
    </TasksSearchProvider>
  );
}
