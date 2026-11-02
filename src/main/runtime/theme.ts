import type { NativeTheme } from 'electron';
import { WINDOW_BACKGROUND } from '@common/theme';
import type { ThemeSetting } from '@main/core';

// Applies the theme setting. nativeTheme.themeSource decides what the page's prefers-color-scheme
// reports, which tokens.css follows, so the page needs no script to pick its theme.
export function applyTheme(nativeTheme: Pick<NativeTheme, 'themeSource'>, theme: ThemeSetting) {
  nativeTheme.themeSource = theme;
}

// --background in the theme the window shows now, painted before the page has loaded
export function windowBackground(nativeTheme: Pick<NativeTheme, 'shouldUseDarkColors'>): string {
  return nativeTheme.shouldUseDarkColors ? WINDOW_BACKGROUND.dark : WINDOW_BACKGROUND.light;
}
