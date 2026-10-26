import { describe, it, expect, vi } from 'vitest';
import { SettingsService } from '../../settings/service';

vi.mock('electron-store', () => import('../__mocks__/electron-store'));

describe('SettingsService', () => {
  it('returns a default setting value', () => {
    const service = new SettingsService('/fake/path');
    // theme default is 'dark'
    expect(service.get('settings.theme')).toBe('dark');
  });

  it('returns a nested default value', () => {
    const service = new SettingsService('/fake/path');
    expect(service.get('settings.general.timeFormat')).toBe('12');
  });

  it('updates a setting with set()', () => {
    const service = new SettingsService('/fake/path');
    service.set('settings.general.timeFormat', '24');
    expect(service.get('settings.general.timeFormat')).toBe('24');
  });

  it('each instance is independent', () => {
    const a = new SettingsService('/path/a');
    const b = new SettingsService('/path/b');
    a.set('settings.general.timeFormat', '24');
    expect(b.get('settings.general.timeFormat')).toBe('12');
  });
});
