import { createContext, useCallback, useContext } from 'react';

/**
 * The platform the window runs on, as far as the page cares: who draws the window controls
 * (src/main/runtime/window-chrome.ts) and how keys are named.
 *
 * - `macos`: the system draws the traffic lights over the page's top left; keys read ⌘, ⇧, ⌥.
 * - `windows`: Windows draws minimise, maximise and close over the page's top right, and the page
 *   draws a menu button for the menu bar it doesn't show; keys read Ctrl, Shift, Alt.
 * - `linux`: the system frame draws the title bar and menu bar above the page; keys as Windows.
 */
export type Platform = 'macos' | 'windows' | 'linux';

/** Node's `process.platform` as a `Platform`: anything but macOS and Windows keeps a system frame. */
export function platformFromNode(nodePlatform: string): Platform {
  if (nodePlatform === 'darwin') return 'macos';
  if (nodePlatform === 'win32') return 'windows';
  return 'linux';
}

/**
 * This page's platform, from the preload's bridge. Without a bridge (Storybook, tests) it is
 * macOS, which the designs are drawn for; stories pick another with `WindowFrameProvider`.
 */
export function detectPlatform(): Platform {
  if (typeof window === 'undefined') return 'macos';
  const nodePlatform = (window as Partial<Window>).ipcBridge?.platform;
  return nodePlatform ? platformFromNode(nodePlatform) : 'macos';
}

/**
 * Who draws the window controls: `system`, in the app, where the system draws them and the page
 * only keeps their space; `drawn`, where the page paints stand-ins (stories, mock-ups).
 */
export type WindowControls = 'system' | 'drawn';

/** The window around the page, as the title bar, the shell and key names need it. */
export interface WindowFrame {
  platform: Platform;
  controls: WindowControls;
  /**
   * Pops up the app menu at a point in the window (CSS pixels from its top left): the Windows
   * title bar's menu button, as Windows shows no menu bar there. The app calls `app.showMenu`.
   */
  onOpenAppMenu?: (at: { x: number; y: number }) => void;
}

const WindowFrameContext = createContext<WindowFrame>({
  platform: detectPlatform(),
  controls: 'system',
});

/**
 * Sets the window frame for a subtree: the app's root (with `onOpenAppMenu`), and stories, which
 * pick a platform and draw the controls. Without one, the platform is detected and the system
 * draws the controls.
 */
export const WindowFrameProvider = WindowFrameContext.Provider;

export function useWindowFrame(): WindowFrame {
  return useContext(WindowFrameContext);
}

export function usePlatform(): Platform {
  return useWindowFrame().platform;
}

// macOS's modifier glyphs, in the order Windows and Linux write them: Ctrl+Alt+Shift+key
const MODIFIERS: [glyph: string, name: string][] = [
  ['⌘', 'Ctrl'],
  ['⌃', 'Ctrl'],
  ['⌥', 'Alt'],
  ['⇧', 'Shift'],
];
// keys whose glyph only macOS uses, named as the key caps on other keyboards
const KEY_NAMES: Record<string, string> = { '↵': 'Enter', '⌫': 'Backspace', '⌦': 'Delete' };

/**
 * Keys written as on macOS ("⌘K", "⌘⇧X", "⇧2", "⌘↵"), named for `platform`: on Windows and Linux
 * "Ctrl+K", "Ctrl+Shift+X", "Shift+2", "Ctrl+Enter". Only a chord with a modifier changes, so a
 * lone key ("↵", "F") or a sequence ("G T") reads the same everywhere. ⌘ is Ctrl because the app's
 * shortcuts are bound to Mod, which is Ctrl off macOS.
 */
export function formatKeys(keys: string, platform: Platform): string {
  if (platform === 'macos') return keys;
  const names = MODIFIERS.filter(([glyph]) => keys.includes(glyph)).map(([, name]) => name);
  if (names.length === 0) return keys;
  let key = keys;
  for (const [glyph] of MODIFIERS) key = key.split(glyph).join('');
  const parts = [...new Set(names)];
  if (key !== '') parts.push(KEY_NAMES[key] ?? key);
  return parts.join('+');
}

/** `formatKeys` for this subtree's platform. */
export function useFormatKeys(): (keys: string) => string {
  const platform = usePlatform();
  return useCallback((keys: string) => formatKeys(keys, platform), [platform]);
}
