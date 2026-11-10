import type {
  BrowserWindow,
  BrowserWindowConstructorOptions,
  NativeTheme,
  TitleBarOverlayOptions,
} from 'electron';
import { WINDOW_BACKGROUND, WINDOW_FOREGROUND } from '@common/theme';

// The height of the strip across the top of the page that stands in for a title bar: the
// WindowBar, and the page header beside the full sidebar (PageHeader).
export const TITLE_BAR_HEIGHT = 48;

// Where macOS draws the traffic lights (the top left of the three 12px buttons): 16px in and 18px
// down, centred in the 48px title bar strip: the sidebar's window row and the WindowBar alike.
export const TRAFFIC_LIGHT_POSITION = { x: 16, y: 18 } as const;

/**
 * The window frame on each platform. The page draws the title bar itself (WindowBar, PageHeader,
 * the sidebar's window row) and leaves room for the controls the system draws:
 *
 * - **macOS**: no title bar (`hiddenInset`); the system draws the traffic lights over the page's
 *   top left, in the slot the page keeps for them.
 * - **Windows**: no title bar (`hidden`), with the Window Controls Overlay: Windows draws minimise,
 *   maximise and close over the page's top right, as tall as the page's title bar and in the
 *   theme's colours. Windows draws them, rather than the page, so maximise keeps its snap layouts.
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

/** The Windows controls' colours: the theme's --background behind --foreground symbols. */
export function titleBarOverlay(
  theme: Pick<NativeTheme, 'shouldUseDarkColors'>,
): TitleBarOverlayOptions {
  const mode = theme.shouldUseDarkColors ? 'dark' : 'light';
  return {
    color: WINDOW_BACKGROUND[mode],
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
