import { createContext, useContext, useMemo, useState, type ReactNode } from 'react';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import type { SearchEntityType } from '@common/types';
import {
  DropdownMenuFilter,
  DropdownMenuItem,
  type DropdownMenuItemProps,
} from '@renderer/components';
import { trpc } from '@renderer/ipc';
import { toResultRow, type ResultRow } from '@renderer/shared/lib/result-row';
import { SEARCH_DEBOUNCE_MS, useDebouncedValue } from '../hooks/use-debounced-value';
import { entityGlyph } from './EntityGlyph';
import { SearchHighlight } from './SearchHighlight';

// A picker with a search row (Link to ›, Make subtask of ›, a project picker) lists the rows it
// loaded while nothing is typed: the latest, the nearest. Once something is typed it asks
// search.search for its types, debounced as ⌘K is, so it finds what it never loaded. Each picker
// leaves out what it can't offer (closed tasks, subtasks, read-only synced rows).
//
//   <PickerSearchFilter>                  // in place of DropdownMenuFilter
//     <DropdownMenu>…<DropdownMenuSearch />
//       const search = usePickerSearch(['task'])   // in the component drawing the rows
//       search.results ? results.map(row => <ResultItem row={row} />) : the loaded rows

/** The most results a picker's search asks for: more than a picker's list shows in practice. */
export const PICKER_SEARCH_LIMIT = 50;

// null outside a PickerSearchFilter, where usePickerSearch has no search row to read
const PickerQuery = createContext<string | null>(null);

/**
 * `DropdownMenuFilter` for a picker that searches: it holds the search row's query for
 * `usePickerSearch` and turns off the menu's own filtering, as the picker filters its rows.
 */
export function PickerSearchFilter({ children }: { children: ReactNode }) {
  const [query, setQuery] = useState('');
  return (
    <PickerQuery.Provider value={query}>
      <DropdownMenuFilter value={query} onValueChange={setQuery} filter={null}>
        {children}
      </DropdownMenuFilter>
    </PickerQuery.Provider>
  );
}

export interface PickerSearch {
  /** what is typed in the search row, trimmed */
  query: string;
  /**
   * The matches of the last search that finished, best first; kept while the next one runs, so
   * typing never blanks the list. null while nothing is typed, and while the first search runs:
   * the picker then shows its loaded rows, narrowed with `matches`.
   */
  results: ResultRow[] | null;
  /** whether a loaded row's title matches what is typed (everything matches an empty query) */
  matches: (title: string) => boolean;
}

/**
 * The search for the picker around it (a `PickerSearchFilter`): `search.search` with `types` once
 * something is typed, debounced like ⌘K's. Leave out what the picker can't offer from `results`.
 * Throws outside a `PickerSearchFilter`, which would otherwise never search.
 */
export function usePickerSearch(types: readonly SearchEntityType[]): PickerSearch {
  const context = useContext(PickerQuery);
  if (context === null) {
    throw new Error('usePickerSearch needs a PickerSearchFilter around its menu');
  }
  const query = context.trim();
  const searched = useDebouncedValue(query, SEARCH_DEBOUNCE_MS);
  const search = useQuery({
    ...trpc.search.search.queryOptions({
      query: searched,
      entityType: [...types],
      limit: PICKER_SEARCH_LIMIT,
    }),
    enabled: searched !== '',
    placeholderData: keepPreviousData,
  });
  // a query search cannot read ("(") finds nothing rather than failing
  const results = useMemo(
    () => (search.isError ? [] : search.data)?.map(toResultRow) ?? null,
    [search.isError, search.data],
  );
  const lower = query.toLocaleLowerCase();
  return {
    query,
    results: query === '' ? null : results,
    matches: (title) => title.toLocaleLowerCase().includes(lower),
  };
}

/**
 * A search result as a picker's item: its glyph, and its title with the matches highlighted.
 * `label` is the title as text, for the menu's type-ahead.
 */
export function ResultItem({
  row,
  ...props
}: { row: ResultRow } & Omit<DropdownMenuItemProps, 'icon' | 'label' | 'children'>) {
  return (
    <DropdownMenuItem
      icon={entityGlyph(row.type, row.status, row.color)}
      label={row.title || 'Untitled'}
      {...props}
    >
      {row.title ? <SearchHighlight html={row.titleHtml} /> : 'Untitled'}
    </DropdownMenuItem>
  );
}
