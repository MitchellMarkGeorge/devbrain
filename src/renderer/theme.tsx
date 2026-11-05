import { useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import type { ThemeSetting } from '@main/core';
import { trpc } from './ipc';

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

/** Keeps the page on the theme setting as it changes (settings.get refetches on every change). */
export function FollowThemeSetting() {
  const settings = useQuery(trpc.settings.get.queryOptions());
  const theme = settings.data?.theme;
  useEffect(() => {
    if (theme) applyThemeSetting(theme);
  }, [theme]);
  return null;
}
