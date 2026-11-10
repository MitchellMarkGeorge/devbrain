import { useCallback } from 'react';
import { useSuspenseQuery } from '@tanstack/react-query';
import { trpc } from '../../ipc';
import { tasksRoute } from './route-api';
import { resolveTasksSearch, type ResolvedTasksSearch, type TasksSearch } from './search';

/**
 * The tasks page's state from its URL, every missing param filled from the settings, and the
 * function that changes it. A toolbar change replaces the history entry (Back goes to the
 * previous page, not the previous filter); opening the sheet pushes one (Back closes it).
 */
export function useTasksSearch(): {
  search: TasksSearch;
  resolved: ResolvedTasksSearch;
  setSearch: (patch: Partial<TasksSearch>, options?: { push?: boolean }) => void;
} {
  const search = tasksRoute.useSearch();
  const navigate = tasksRoute.useNavigate();
  const settings = useSuspenseQuery(trpc.settings.get.queryOptions()).data;
  const setSearch = useCallback(
    (patch: Partial<TasksSearch>, options: { push?: boolean } = {}) =>
      void navigate({
        search: (previous) => ({ ...previous, ...patch }),
        replace: !options.push,
      }),
    [navigate],
  );
  return { search, resolved: resolveTasksSearch(search, settings), setSearch };
}
