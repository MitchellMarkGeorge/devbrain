import { createContext, useContext, type RefObject } from 'react';

/**
 * The window's size range (README "Window sizes"): `compact` below `breakpoint-medium` (1080px),
 * `medium` below `breakpoint-wide` (1280px), `wide` from there up.
 */
export type WindowSize = 'compact' | 'medium' | 'wide';

/**
 * How the macOS traffic lights are drawn: `reserved` leaves their 52px for the system's own
 * (Electron's `hiddenInset` title bar), `drawn` paints stand-ins (stories, mock-ups), `none` drops
 * the space (Windows and Linux, whose controls sit in their own frame).
 */
export type TrafficLightsMode = 'reserved' | 'drawn' | 'none';

export interface AppShellContextValue {
  /** rendered inside an `AppShell` */
  inShell: boolean;
  size: WindowSize;
  /** the sidebar rests as the 56px rail: the user collapsed it, or the window is compact */
  rail: boolean;
  /** this subtree is the compact window's sidebar drawer */
  inDrawer: boolean;
  drawerOpen: boolean;
  /** the window bar's sidebar button: collapses or expands, or opens the drawer when compact */
  toggleSidebar: () => void;
  closeDrawer: () => void;
  trafficLights: TrafficLightsMode;
  onBack?: () => void;
  onForward?: () => void;
  canGoBack: boolean;
  canGoForward: boolean;
  /** the docked sheet's column: pass it to `SheetContent container` */
  sheetContainer: RefObject<HTMLDivElement | null> | null;
}

const noop = () => {};

export const AppShellContext = createContext<AppShellContextValue>({
  inShell: false,
  size: 'wide',
  rail: false,
  inDrawer: false,
  drawerOpen: false,
  toggleSidebar: noop,
  closeDrawer: noop,
  trafficLights: 'reserved',
  canGoBack: true,
  canGoForward: false,
  sheetContainer: null,
});

/** The shell around this component: window size, rail or drawer, and the window controls. */
export function useAppShell(): AppShellContextValue {
  return useContext(AppShellContext);
}
