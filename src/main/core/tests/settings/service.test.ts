import { describe, it, expect, vi } from 'vitest';
import { SettingsService } from '../../settings/service';
import { getDefaults } from '../../settings/defaults';
import MockStore from '../__mocks__/electron-store';

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

  it("drops the time zone an older version's settings file holds", () => {
    const { settings, state } = getDefaults('/fake/path');
    MockStore.fileContents = {
      settings: { ...settings, calendar: { ...settings.calendar, timezone: 'Toronto UTC' } },
      state,
    };
    const service = new SettingsService('/fake/path');
    expect(service.get('settings.calendar')).toEqual(settings.calendar);
    expect(service.get('settings.calendar')).not.toHaveProperty('timezone');
  });
});
