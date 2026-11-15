import type {
  BrowserWindow,
  BrowserWindowConstructorOptions,
  NativeTheme,
  TitleBarOverlayOptions,
} from 'electron';
import {
  TITLE_BAR_BACKGROUND,
  TITLE_BAR_HEIGHT,
  WINDOW_BACKGROUND,
  WINDOW_FOREGROUND,
} from '@common/theme';

// The height of the title bar the page draws across its top (the `title-bar-height` token,
// generated into @common/theme): the WorkspaceShell's and the AppShell's.
export { TITLE_BAR_HEIGHT };

// Where macOS draws the traffic lights (the top left of the three 12px buttons): 16px in, and
// centred down the title bar (14px in a 40px bar).
const TRAFFIC_LIGHT_SIZE = 12;
export const TRAFFIC_LIGHT_POSITION = {
  x: 16,
  y: (TITLE_BAR_HEIGHT - TRAFFIC_LIGHT_SIZE) / 2,
} as const;

/**
 * The window frame on each platform. The page draws the title bar itself (the WorkspaceShell's,
 * or the AppShell's) and leaves room for the controls the system draws:
 *
 * - **macOS**: no title bar (`hiddenInset`); the system draws the traffic lights over the page's
 *   top left, in the slot the page keeps for them.
 * - **Windows**: no title bar (`hidden`), with the Window Controls Overlay: Windows draws minimise,
 *   maximise and close over the page's top right, as tall as the page's title bar and in its
 *   colours (the WorkspaceShell's title bar; the AppShell's page colour differs from it only
 *   slightly, in the light theme). Windows draws them, rather than the page, so maximise keeps its snap layouts.
 *   The page keeps that corner clear with the `titlebar-area-*` CSS environment variables.
 * - **Linux**: the system frame, title bar and menu bar included. Desktops place and draw window
 *   controls differently, and some have no title bar at all, so the page draws none of them.
 */
export function windowChrome(
  platform: NodeJS.Platform,
  theme: Pick<NativeTheme, 'shouldUseDarkColors'>,
): BrowserWindowConstructorOptions {
  switch (platform) {
    case 'darwin':
      return { titleBarStyle: 'hiddenInset', trafficLightPosition: TRAFFIC_LIGHT_POSITION };
    case 'win32':
      return { titleBarStyle: 'hidden', titleBarOverlay: titleBarOverlay(theme) };
    default:
      return {};
  }
}

/**
 * Keeps the traffic lights where the page leaves room for them. macOS can drop a window's button
 * position when the window changes state, drawing them at its own spot (higher, further left,
 * beside the page's sidebar toggle rather than before it): when the window is shown again after
 * being hidden (closing hides it on macOS), restored, focused, or out of full screen. Each puts
 * them back.
 */
export function keepTrafficLights(
  window: Pick<BrowserWindow, 'on' | 'setWindowButtonPosition'>,
  platform: NodeJS.Platform,
): void {
  if (platform !== 'darwin') return;
  const place = () => window.setWindowButtonPosition(TRAFFIC_LIGHT_POSITION);
  window.on('show', place);
  window.on('restore', place);
  window.on('focus', place);
  window.on('leave-full-screen', place);
}

/** The Windows controls' colours: the title bar's (--sidebar) behind --foreground symbols. */
export function titleBarOverlay(
  theme: Pick<NativeTheme, 'shouldUseDarkColors'>,
): TitleBarOverlayOptions {
  const mode = theme.shouldUseDarkColors ? 'dark' : 'light';
  return {
    color: TITLE_BAR_BACKGROUND[mode],
    symbolColor: WINDOW_FOREGROUND[mode],
    height: TITLE_BAR_HEIGHT,
  };
}

/**
 * Follows a change of theme in what the system paints: the window's background, and on Windows
 * the controls it draws over the page, which don't follow the page's CSS.
 */
export function repaintChrome(
  window: Pick<BrowserWindow, 'setBackgroundColor' | 'setTitleBarOverlay'>,
  platform: NodeJS.Platform,
  theme: Pick<NativeTheme, 'shouldUseDarkColors'>,
): void {
  window.setBackgroundColor(WINDOW_BACKGROUND[theme.shouldUseDarkColors ? 'dark' : 'light']);
  if (platform === 'win32') window.setTitleBarOverlay(titleBarOverlay(theme));
}
