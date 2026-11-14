// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest';
import { applyThemeSetting } from '@renderer/app/theme';

describe('applyThemeSetting', () => {
  it('pins light and dark on <html>, and lets system follow the system', () => {
    const root = document.createElement('html');
    applyThemeSetting('dark', root);
    expect(root.dataset.theme).toBe('dark');
    applyThemeSetting('light', root);
    expect(root.dataset.theme).toBe('light');
    applyThemeSetting('system', root);
    expect(root.dataset.theme).toBeUndefined();
  });
});
