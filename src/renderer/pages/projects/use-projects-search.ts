import { useCallback } from 'react';
import { projectsRoute } from './route-api';
import { resolveProjectsSearch, type ProjectsSearch, type ResolvedProjectsSearch } from './search';

/**
 * The projects page's state from its URL, every missing param filled with its default, and the
 * function that changes it. A toolbar change replaces the history entry: Back goes to the previous
 * page, not the previous filter.
 */
export function useProjectsSearch(): {
  search: ProjectsSearch;
  resolved: ResolvedProjectsSearch;
  setSearch: (patch: Partial<ProjectsSearch>) => void;
} {
  const search = projectsRoute.useSearch();
  const navigate = projectsRoute.useNavigate();
  const setSearch = useCallback(
    (patch: Partial<ProjectsSearch>) =>
      void navigate({ search: (previous) => ({ ...previous, ...patch }), replace: true }),
    [navigate],
  );
  return { search, resolved: resolveProjectsSearch(search), setSearch };
}
