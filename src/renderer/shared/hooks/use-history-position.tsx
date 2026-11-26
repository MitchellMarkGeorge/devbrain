import { createContext, useCallback, useContext, useEffect, useRef, type ReactNode } from 'react';
import { useRouter, useRouterState, type RouterHistory } from '@tanstack/react-router';
import type { WorkspaceId } from '@common/ids';
import { workspaceIdOfPage } from '@common/types';

/**
 * The workspace the history entry at an index shows: null for a page outside one (onboarding,
 * Create workspace), undefined when it isn't known (an entry from before a reload).
 */
type WorkspaceOfEntry = (index: number) => WorkspaceId | null | undefined;

const WorkspaceOfEntryContext = createContext<WorkspaceOfEntry | null>(null);

/**
 * Records which workspace each entry of `history` shows, by its index (`__TSR_index`), for
 * `useHistoryPosition` below it: `AppWindow` holds it around the router. Pushing or replacing an
 * entry writes over its index, and a push drops the entries after it, so every index below
 * `history.length` is the entry there now.
 */
export function HistoryPositionProvider({
  history,
  children,
}: {
  history: RouterHistory;
  children: ReactNode;
}) {
  const workspaces = useRef(new Map<number, WorkspaceId | null>());
  useEffect(() => {
    const record = (location: RouterHistory['location']) =>
      workspaces.current.set(location.state.__TSR_index ?? 0, workspaceIdOfPage(location.pathname));
    // the entry shown now, then each one the history moves to
    record(history.location);
    return history.subscribe(({ location }) => record(location));
  }, [history]);
  const workspaceOf = useCallback<WorkspaceOfEntry>((index) => workspaces.current.get(index), []);
  return (
    <WorkspaceOfEntryContext.Provider value={workspaceOf}>
      {children}
    </WorkspaceOfEntryContext.Provider>
  );
}

/**
 * Whether the window's history has an entry before and after this one: the window bar's arrows,
 * and any other Back in the app. Use this rather than TanStack's `useCanGoBack` (experimental, and
 * with no forward counterpart). The router stamps each entry with its index (`__TSR_index`, typed
 * in @tanstack/history's `ParsedHistoryState`); the history's length counts the entries after it
 * too. tanstack-behaviour.test.ts checks both, so an upgrade that changes them fails there.
 *
 * On a page in a workspace, only an entry in the same workspace counts: Back and Forward stay within
 * the workspace shown, so they never switch (docs/renderer/routing.md, "Back and Forward"). An
 * entry not known (from before a reload, or outside a `HistoryPositionProvider`) doesn't count
 * either. `acrossWorkspaces` counts every entry, for a Back that means to leave the workspace (a
 * failed open's "Back to ‹name›"). `back` is how many entries Back means to go (1, or more for a
 * page that leaves several of its own behind it: a project's tabs): `canGoBack` then says whether
 * the entry that far back is there.
 */
export function useHistoryPosition({ acrossWorkspaces = false, back = 1 } = {}): {
  canGoBack: boolean;
  canGoForward: boolean;
} {
  const router = useRouter();
  const workspaceOf = useContext(WorkspaceOfEntryContext);
  const index = useRouterState({ select: (state) => state.location.state.__TSR_index ?? 0 });
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const hasBefore = index - back >= 0;
  const hasAfter = index < router.history.length - 1;
  const workspaceId = workspaceIdOfPage(pathname);
  if (acrossWorkspaces || workspaceId === null) {
    return { canGoBack: hasBefore, canGoForward: hasAfter };
  }
  const inThisWorkspace = (at: number) => workspaceOf?.(at) === workspaceId;
  return {
    canGoBack: hasBefore && inThisWorkspace(index - back),
    canGoForward: hasAfter && inThisWorkspace(index + 1),
  };
}
