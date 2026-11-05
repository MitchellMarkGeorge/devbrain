import type { NativeTheme } from 'electron';
import { WINDOW_BACKGROUND } from '@common/theme';
import type { ThemeSetting } from '@main/core';

// Applies the theme setting to what the system draws: the window's background, native menus and
// dialogs, and Windows' caption buttons. The page applies it to itself (src/renderer/theme.ts), as
// a change of themeSource doesn't reliably reach its prefers-color-scheme.
export function applyTheme(nativeTheme: Pick<NativeTheme, 'themeSource'>, theme: ThemeSetting) {
  nativeTheme.themeSource = theme;
}

// --background in the theme the window shows now, painted before the page has loaded
export function windowBackground(nativeTheme: Pick<NativeTheme, 'shouldUseDarkColors'>): string {
  return nativeTheme.shouldUseDarkColors ? WINDOW_BACKGROUND.dark : WINDOW_BACKGROUND.light;
}
