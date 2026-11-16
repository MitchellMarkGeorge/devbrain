import { createContext, useContext, useState, type ReactNode } from 'react';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import type { SearchEntityType, SearchResult } from '@common/types';
import { DropdownMenuEmpty, DropdownMenuFilter } from '@renderer/components';
import { trpc } from '@renderer/ipc';
import { useDebouncedValue } from '@renderer/shared/hooks/use-debounced-value';
import { SearchHighlight } from './SearchHighlight';

// A picker of events, notes or tasks lists the rows it loaded while nothing is typed: the nearest
// events, the notes and tasks changed last. Once something is typed it asks `search.search` for
// its types: each match carries the entity it found as that entity's list returns it, so a
// searched row draws as a loaded one does, with its title's matches in bold. Until the first
// search answers it keeps showing the loaded rows; after that, the last results.
//
//   <PickerSearchFilter>                  // in place of DropdownMenuFilter
//     <DropdownMenu>…<DropdownMenuSearch />
//       // in the component drawing the rows:
//       const search = usePickerSearch(['note']);
//       const rows = pickerRows(search.results, loadedNotes);
//       …<PickerEmpty searching={search.searching}>No notes match</PickerEmpty>
//
// Projects are few: a project picker loads them all and keeps the menu's own filter.

/**
 * How long typing pauses before a picker searches: shorter than ⌘K's 300ms, as a picker's list is
 * short and a search takes a few milliseconds, so results follow typing closely.
 */
export const PICKER_SEARCH_DEBOUNCE_MS = 120;

/** The most rows a picker's search asks for: more than a picker's list shows in practice. */
export const PICKER_SEARCH_LIMIT = 50;

// null outside a PickerSearchFilter, where usePickerSearch has no search row to read
const PickerQuery = createContext<string | null>(null);

/**
 * `DropdownMenuFilter` for a picker that searches: it holds the search row's query for
 * `usePickerSearch` and turns off the menu's own filtering, as the rows come from search. The
 * first row is highlighted as the user types, so Enter picks the best match.
 */
export function PickerSearchFilter({ children }: { children: ReactNode }) {
  const [query, setQuery] = useState('');
  return (
    <PickerQuery.Provider value={query}>
      <DropdownMenuFilter value={query} onValueChange={setQuery} filter={null} autoHighlight>
        {children}
      </DropdownMenuFilter>
    </PickerQuery.Provider>
  );
}

export interface PickerSearch<Type extends SearchEntityType> {
  /**
   * What the last search that answered found, best first; kept while the next one runs, so the
   * list never blanks as the user types. null while nothing is typed, and until the first search
   * answers: the picker shows its loaded rows then.
   */
  results: SearchResult<Type>[] | null;
  /** something is typed that search hasn't answered yet: an empty list isn't "no matches" */
  searching: boolean;
}

/**
 * The search for the picker around it (a `PickerSearchFilter`): `search.search` for `types` once
 * something is typed and typing pauses. `enabled` false never searches (a kind the picker isn't
 * offering). Throws outside a `PickerSearchFilter`, which would otherwise never search.
 */
export function usePickerSearch<Type extends SearchEntityType>(
  types: readonly Type[],
  enabled = true,
): PickerSearch<Type> {
  const context = useContext(PickerQuery);
  if (context === null) {
    throw new Error('usePickerSearch needs a PickerSearchFilter around its menu');
  }
  const query = context.trim();
  const searched = useDebouncedValue(query, PICKER_SEARCH_DEBOUNCE_MS);
  const result = useQuery({
    ...trpc.search.search.queryOptions({
      query: searched,
      entityType: [...types],
      limit: PICKER_SEARCH_LIMIT,
    }),
    enabled: enabled && searched !== '',
    placeholderData: keepPreviousData,
  });
  if (query === '') return { results: null, searching: false };
  return {
    // search.search answers with the types asked for only
    results: (result.data as SearchResult<Type>[] | undefined) ?? null,
    searching: searched !== query || result.isFetching,
  };
}

/** A picker's row: an entity, and core's highlighted title when search found it. */
export interface PickerRow<Entity> {
  entity: Entity;
  /** core's highlighted title (search's HTML), drawn with `PickerTitle`; none for a loaded row */
  titleHtml?: string;
}

/** The picker's rows: what search found while it has answered, else the loaded entities. */
export function pickerRows<Type extends SearchEntityType>(
  results: SearchResult<Type>[] | null,
  loaded: readonly SearchResult<Type>['entity'][],
): PickerRow<SearchResult<Type>['entity']>[] {
  return results
    ? results.map((result) => ({ entity: result.entity, titleHtml: result.title }))
    : loaded.map((entity) => ({ entity }));
}

/**
 * A picker row's title: search's highlighted title (the matches in bold, drawn by
 * `SearchHighlight` alone), or the loaded entity's title as text.
 */
export function PickerTitle({ row, title }: { row: PickerRow<unknown>; title: string }) {
  return row.titleHtml ? <SearchHighlight html={row.titleHtml} /> : <>{title || 'Untitled'}</>;
}

/**
 * The picker's empty state: "Searching…" while a search the user typed hasn't answered, so the
 * list never says nothing matches before search has looked; `children` once it has.
 */
export function PickerEmpty({ searching, children }: { searching: boolean; children: ReactNode }) {
  return <DropdownMenuEmpty>{searching ? 'Searching…' : children}</DropdownMenuEmpty>;
}
