import { createContext, createElement, useCallback, useContext, type ReactNode } from 'react';
import { useSuspenseQuery } from '@tanstack/react-query';
import type { ProjectId } from '@common/ids';
import { trpc } from '@renderer/ipc';
import { tasksRoute } from '../api/route-api';
import { resolveTasksSearch, type ResolvedTasksSearch, type TasksSearch } from '../api/search';

export interface SetTasksSearchOptions {
  /** a new history entry (Back undoes it); a toolbar change replaces the entry */
  push?: boolean;
  /** marks the entry as the one that opened the board's sheet, so its close goes Back */
  openedSheet?: boolean;
}

/** The tasks views' state from the URL, and the function that changes it. */
export interface TasksSearchState {
  /** the params in the URL, without a fixed project's */
  search: TasksSearch;
  /** every missing param filled from the settings; `project` is the fixed project, if any */
  resolved: ResolvedTasksSearch;
  setSearch: (patch: Partial<TasksSearch>, options?: SetTasksSearchOptions) => void;
  /**
   * The project the views are fixed to (a project's Tasks tab): the Filter menu has no project,
   * Group by no "Project", and New Task files the task there.
   */
  project?: ProjectId;
}

const TasksSearchContext = createContext<TasksSearchState | null>(null);

/** The context itself, for a piece also drawn outside the tasks views (their empty state). */
export const TasksSearchContextOrNull = TasksSearchContext;

/**
 * Gives the tasks views (toolbar, list, group view, board) the state they read: the tasks page's
 * own URL, or a project page's with its project fixed.
 */
export function TasksSearchProvider({
  value,
  children,
}: {
  value: TasksSearchState;
  children: ReactNode;
}) {
  return createElement(TasksSearchContext.Provider, { value }, children);
}

/** The tasks views' state, from the page around them (`TasksSearchProvider`). */
export function useTasksSearch(): TasksSearchState {
  const state = useContext(TasksSearchContext);
  if (!state) throw new Error('useTasksSearch needs a TasksSearchProvider');
  return state;
}

/**
 * The tasks page's state from its URL, every missing param filled from the settings, and the
 * function that changes it. A toolbar change replaces the history entry (Back goes to the
 * previous page, not the previous filter); opening the sheet pushes one (Back closes it).
 */
export function useTasksRouteSearch(): TasksSearchState {
  const search = tasksRoute.useSearch();
  const navigate = tasksRoute.useNavigate();
  const settings = useSuspenseQuery(trpc.settings.get.queryOptions()).data;
  const setSearch = useCallback(
    (patch: Partial<TasksSearch>, options: SetTasksSearchOptions = {}) =>
      void navigate({
        search: (previous) => ({ ...previous, ...patch }),
        replace: !options.push,
        ...(options.openedSheet && {
          state: (previous) => ({ ...previous, openedSheet: true }),
        }),
      }),
    [navigate],
  );
  return { search, resolved: resolveTasksSearch(search, settings), setSearch };
}
