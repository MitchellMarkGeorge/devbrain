import { createContext, useCallback, useContext, useEffect, useRef, type ReactNode } from 'react';
import { useRouterState } from '@tanstack/react-router';
import { workspaceIdOfPage } from '@common/types';

// Each page's search as it was last shown, by its path: what a section's sidebar link and its key
// go back to, so the section is as it was left (its view and filters) however it is reached. The
// root layout (app/Root.tsx) keeps them, for as long as the router keeps where each page scrolled
// (app/router.tsx): until another workspace is shown, so one switched back to starts afresh.

type SearchOf = (pathname: string) => Record<string, unknown> | undefined;

const PageSearchesContext = createContext<SearchOf | null>(null);

// the search params that open a sheet over a page (a task on the board, an event), not what it
// shows: going to the page doesn't open the sheet again
const SHEET_PARAMS = ['open', 'occurrence', 'sheet'];

function withoutSheet(search: object): Record<string, unknown> {
  return Object.fromEntries(Object.entries(search).filter(([key]) => !SHEET_PARAMS.includes(key)));
}

export function PageSearchesProvider({ children }: { children: ReactNode }) {
  // the page shown, once loaded (not one still loading)
  const shown = useRouterState({ select: (state) => state.resolvedLocation ?? state.location });
  const searches = useRef(new Map<string, Record<string, unknown>>());
  // another workspace: the last one's are dropped (before this page's is kept, below)
  const workspaceId = workspaceIdOfPage(shown.pathname);
  useEffect(() => {
    searches.current.clear();
  }, [workspaceId]);
  useEffect(() => {
    searches.current.set(shown.pathname, withoutSheet(shown.search));
  }, [shown.pathname, shown.search]);
  const searchOf = useCallback<SearchOf>((pathname) => searches.current.get(pathname), []);
  return <PageSearchesContext.Provider value={searchOf}>{children}</PageSearchesContext.Provider>;
}

/** The search a page was last shown with, by its path (undefined for one not shown yet). */
export function usePageSearches(): SearchOf {
  const searchOf = useContext(PageSearchesContext);
  if (!searchOf) throw new Error('usePageSearches needs a PageSearchesProvider');
  return searchOf;
}
