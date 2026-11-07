import type { ThemeSetting } from '@common/types';

/**
 * Pins the page to the theme setting: `light` and `dark` set data-theme on <html>, which
 * tokens.css honours over prefers-color-scheme; `system` removes it, so the page follows the
 * system's appearance. Done in the page because a change of Electron's nativeTheme.themeSource
 * (src/main/runtime/theme.ts) doesn't reliably reach prefers-color-scheme.
 */
export function applyThemeSetting(
  theme: ThemeSetting,
  root: HTMLElement = document.documentElement,
) {
  if (theme === 'system') delete root.dataset.theme;
  else root.dataset.theme = theme;
}
