import { useEffect } from 'react';
import { useRouterState } from '@tanstack/react-router';

// Where focus goes when the page changes. A page swap unmounts what had focus (the row that
// opened a task, the task page that went Back), and focus falls to the document: the next Tab
// starts from the sidebar, and the list keys, whose scope is read from the focused element
// (keyboard/scopes.ts), do nothing until the user clicks or tabs in.

/** what on a page takes focus when it opens: its list's tab stop, else its title, else the page */
const TARGETS = ['[role="grid"] [role="row"][tabindex="0"]', 'h1'];

/**
 * After the path changes (not a search change: a filter, or a sheet's `open`), focuses the new
 * page when focus was lost: its list's focused row, so the list keys work at once, else its `h1`,
 * else the `<main>` itself (both made focusable without entering the tab order). Focus the page
 * put somewhere itself (an editor's autofocus, a dialog) is left there.
 */
export function usePageFocus(): void {
  const path = useRouterState({ select: (state) => state.resolvedLocation?.pathname });
  useEffect(() => {
    if (path === undefined) return;
    // a frame, for the page's list to draw its rows
    const frame = requestAnimationFrame(() => {
      const active = document.activeElement;
      if (active && active !== document.body && active.isConnected) return;
      const main = document.querySelector('main');
      if (!main) return;
      const target =
        TARGETS.map((selector) => main.querySelector<HTMLElement>(selector)).find(Boolean) ?? main;
      if (target.tabIndex < 0 && !target.hasAttribute('tabindex')) target.tabIndex = -1;
      target.focus({ preventScroll: true });
    });
    return () => cancelAnimationFrame(frame);
  }, [path]);
}
