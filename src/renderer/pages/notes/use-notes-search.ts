import { useCallback } from 'react';
import { notesRoute } from './route-api';
import { resolveNotesSearch, type NotesSearch, type ResolvedNotesSearch } from './search';

/**
 * The notes page's state from its URL, every missing param filled in, and the function that
 * changes it. A toolbar change replaces the history entry: Back goes to the previous page, not the
 * previous filter.
 */
export function useNotesSearch(): {
  search: NotesSearch;
  resolved: ResolvedNotesSearch;
  setSearch: (patch: Partial<NotesSearch>) => void;
} {
  const search = notesRoute.useSearch();
  const navigate = notesRoute.useNavigate();
  const setSearch = useCallback(
    (patch: Partial<NotesSearch>) =>
      void navigate({ search: (previous) => ({ ...previous, ...patch }), replace: true }),
    [navigate],
  );
  return { search, resolved: resolveNotesSearch(search), setSearch };
}
