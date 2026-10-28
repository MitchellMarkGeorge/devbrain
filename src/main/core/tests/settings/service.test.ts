import { describe, it, expect, vi } from 'vitest';
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

  it('sends each write after it is made, and a reset', () => {
    const service = new SettingsService('/fake/path', openMemorySettingsStore);
    const seen: unknown[] = [];
    service.onChange((change) =>
      // the value as written, read from the listener
      seen.push(change.type === 'updated' ? { ...change, value: service.get(change.key) } : change),
    );

    service.set('settings.general.timeFormat', '24');
    service.reset();

    expect(seen).toEqual([
      { type: 'updated', key: 'settings.general.timeFormat', value: '24' },
      { type: 'reset' },
    ]);
  });

  it('keeps writing when a listener throws, and stops sending once unsubscribed', () => {
    const logger = { error: vi.fn() };
    const service = new SettingsService('/fake/path', openMemorySettingsStore, { logger });
    const unsubscribe = service.onChange(() => {
      throw new Error('listener failed');
    });

    service.set('settings.general.timeFormat', '24');
    unsubscribe();
    service.set('settings.general.timeFormat', '12');

    expect(service.get('settings.general.timeFormat')).toBe('12');
    expect(logger.error).toHaveBeenCalledOnce();
  });
});
