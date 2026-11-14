import { createContext, useContext } from 'react';

/**
 * The window's size range (README "Window sizes"): `compact` below `breakpoint-medium` (1080px),
 * `medium` below `breakpoint-wide` (1280px), `wide` from there up.
 */
export type WindowSize = 'compact' | 'medium' | 'wide';

export interface WorkspaceShellContextValue {
  /** rendered inside a `WorkspaceShell` */
  inShell: boolean;
  size: WindowSize;
  /**
   * The sidebar is hidden (the user collapsed it, or the window is compact): its column has slid
   * shut, the page's card spans the window under the title bar, and the sidebar opens as a drawer
   * over the page.
   */
  sidebarHidden: boolean;
  /** this subtree is the sidebar drawer */
  inDrawer: boolean;
  drawerOpen: boolean;
  /** the drawer was opened by pointing at the toggle or the window's left edge, and not yet pinned */
  peeking: boolean;
  /**
   * The sidebar toggle (and ⌘\): hides the docked sidebar; while hidden, docks it where the window
   * is wide enough, and otherwise opens (or pins) the drawer, or closes a pinned one.
   */
  toggleSidebar: () => void;
  closeDrawer: () => void;
  /** the pointer reached the toggle or the left edge: peek at the drawer after a short delay */
  peekSidebar: () => void;
  /** the pointer left before the drawer opened */
  cancelPeek: () => void;
  onBack?: () => void;
  onForward?: () => void;
  canGoBack: boolean;
  canGoForward: boolean;
  /**
   * The docked sheet's column: pass it to `SheetContent container`. Null until the shell has
   * mounted it, and outside a shell; a docked sheet waits for it (else it would land in the body)
   */
  sheetContainer: HTMLElement | null;
  /**
   * The title bar's slot for the page's header, after the window's controls: `Page` portals its
   * `header` into it. Null outside a shell, where a `Page` draws its header itself
   */
  titleBarContainer: HTMLElement | null;
}

const noop = () => {};

export const WorkspaceShellContext = createContext<WorkspaceShellContextValue>({
  inShell: false,
  size: 'wide',
  sidebarHidden: false,
  inDrawer: false,
  drawerOpen: false,
  peeking: false,
  toggleSidebar: noop,
  closeDrawer: noop,
  peekSidebar: noop,
  cancelPeek: noop,
  canGoBack: true,
  canGoForward: false,
  sheetContainer: null,
  titleBarContainer: null,
});

/** The shell around this component: window size, whether the sidebar is hidden, the drawer, and the window controls. */
export function useWorkspaceShell(): WorkspaceShellContextValue {
  return useContext(WorkspaceShellContext);
}
