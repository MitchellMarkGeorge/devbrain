import { describe, it, expect } from 'vitest';
import { SettingsService } from '../../settings/service';

import { openMemorySettingsStore } from '../__mocks__/memory-settings-store';

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

  it('each instance is independent', () => {
    const a = new SettingsService('/path/a', openMemorySettingsStore);
    const b = new SettingsService('/path/b', openMemorySettingsStore);
    a.set('settings.general.timeFormat', '24');
    expect(b.get('settings.general.timeFormat')).toBe('12');
  });
});
