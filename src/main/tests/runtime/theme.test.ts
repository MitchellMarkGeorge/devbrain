import { describe, expect, it } from 'vitest';
import { WINDOW_BACKGROUND } from '@common/theme';
import { applyTheme, windowBackground } from '../../runtime/theme';

describe('applyTheme', () => {
  it('sets the theme setting as the theme source', () => {
    const nativeTheme = { themeSource: 'dark' as 'system' | 'light' | 'dark' };
    applyTheme(nativeTheme, 'system');
    expect(nativeTheme.themeSource).toBe('system');
    applyTheme(nativeTheme, 'light');
    expect(nativeTheme.themeSource).toBe('light');
  });
});

describe('windowBackground', () => {
  it("is the theme's --background", () => {
    expect(windowBackground({ shouldUseDarkColors: true })).toBe(WINDOW_BACKGROUND.dark);
    expect(windowBackground({ shouldUseDarkColors: false })).toBe(WINDOW_BACKGROUND.light);
  });
});
