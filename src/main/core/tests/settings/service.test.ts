import { describe, it, expect } from 'vitest';
import { SettingsService } from '../../settings/service';

import { getDefaults } from '../../settings/defaults';
import type { OpenSettingsStore } from '../../settings/store';
import { openMemorySettingsStore } from '../__mocks__/memory-settings-store';

// a settings file written before calendar.showWeekends, with some settings changed
function settingsFileWithoutShowWeekends() {
  const file = getDefaults('/fake/path');
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { showWeekends, ...calendar } = file.settings.calendar;
  return {
    ...file,
    settings: { ...file.settings, calendar: { ...calendar, firstDayOfWeek: 'sunday' } },
    state: { ...file.state, lastPage: '/calendar' },
  };
}

// opens a store already holding `file`, as electron-store opens an existing settings.json: its
// own `settings` and `state` hide the defaults' whole
const openExisting =
  (file: object): OpenSettingsStore =>
  (rootPath) =>
    openMemorySettingsStore(rootPath, file as never);

describe('SettingsService', () => {
  it('returns a default setting value', () => {
    const service = new SettingsService('/fake/path', openMemorySettingsStore);
    // theme default is 'dark'
    expect(service.get('settings.theme')).toBe('dark');
  });

  it('returns a nested default value', () => {
    const service = new SettingsService('/fake/path', openMemorySettingsStore);
    expect(service.get('settings.general.timeFormat')).toBe('12');
  });

  it('updates a setting with set()', () => {
    const service = new SettingsService('/fake/path', openMemorySettingsStore);
    service.set('settings.general.timeFormat', '24');
    expect(service.get('settings.general.timeFormat')).toBe('24');
  });

  it('fills a setting the file was written without with its default, keeping the rest', () => {
    const service = new SettingsService(
      '/fake/path',
      openExisting(settingsFileWithoutShowWeekends()),
    );
    expect(service.get('settings.calendar.showWeekends')).toBe(true);
    expect(service.get('settings.calendar')).toEqual({
      ...getDefaults('/fake/path').settings.calendar,
      firstDayOfWeek: 'sunday',
    });
    expect(service.get('state.lastPage')).toBe('/calendar');
  });

  it('keeps a stored false rather than the default', () => {
    const file = getDefaults('/fake/path');
    file.settings.calendar.showWeekends = false;
    const service = new SettingsService('/fake/path', openExisting(file));
    expect(service.get('settings.calendar.showWeekends')).toBe(false);
  });

  it('reads the defaults again after reset()', () => {
    const service = new SettingsService('/fake/path', openMemorySettingsStore);
    service.set('settings.calendar.showWeekends', false);
    service.reset();
    expect(service.get('settings')).toEqual(getDefaults('/fake/path').settings);
  });

  it('each instance is independent', () => {
    const a = new SettingsService('/path/a', openMemorySettingsStore);
    const b = new SettingsService('/path/b', openMemorySettingsStore);
    a.set('settings.general.timeFormat', '24');
    expect(b.get('settings.general.timeFormat')).toBe('12');
  });
});
