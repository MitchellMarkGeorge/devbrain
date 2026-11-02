import { describe, it, expect, vi } from 'vitest';
import { SettingsService } from '../../settings/service';
import type { OpenSettingsStore, SettingsStore } from '../../settings/store';

import { openMemorySettingsStore } from '../__mocks__/memory-settings-store';

describe('SettingsService', () => {
  it('returns a default setting value', () => {
    const service = new SettingsService('/fake/path', openMemorySettingsStore);
    // the theme follows the system by default
    expect(service.get('settings.theme')).toBe('system');
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

  describe('onChange', () => {
    it('sends every setting after a write under settings', () => {
      const service = new SettingsService('/fake/path', openMemorySettingsStore);
      const changes: unknown[] = [];
      service.onChange((change) => changes.push(change));
      service.set('settings.theme', 'light');
      expect(changes).toEqual([
        { type: 'updated', settings: expect.objectContaining({ theme: 'light' }) },
      ]);
    });

    it('sends nothing for a write to the app state', () => {
      const service = new SettingsService('/fake/path', openMemorySettingsStore);
      const listener = vi.fn();
      service.onChange(listener);
      service.set('state.lastPage', '/tasks');
      expect(listener).not.toHaveBeenCalled();
    });

    it('stops sending once unsubscribed', () => {
      const service = new SettingsService('/fake/path', openMemorySettingsStore);
      const listener = vi.fn();
      const unsubscribe = service.onChange(listener);
      unsubscribe();
      service.set('settings.theme', 'dark');
      expect(listener).not.toHaveBeenCalled();
    });
  });

  describe('the system theme', () => {
    // a file from before it: 'dark' was the only theme, and state had no systemThemeApplied
    const openOldFile: OpenSettingsStore = (rootPath, defaults) =>
      openMemorySettingsStore(rootPath, {
        settings: { ...defaults.settings, theme: 'dark' },
        state: { lastWorkspaceId: null, lastPage: null },
      });

    it("moves a file from before it from 'dark' to 'system'", () => {
      const service = new SettingsService('/fake/path', openOldFile);
      expect(service.get('settings.theme')).toBe('system');
      expect(service.get('state.systemThemeApplied')).toBe(true);
    });

    it('keeps dark chosen after that', () => {
      let saved: SettingsStore | undefined;
      const openOnce: OpenSettingsStore = (rootPath, defaults) =>
        (saved ??= openOldFile(rootPath, defaults));
      new SettingsService('/fake/path', openOnce).set('settings.theme', 'dark');
      expect(new SettingsService('/fake/path', openOnce).get('settings.theme')).toBe('dark');
    });

    it('leaves a light theme alone', () => {
      const service = new SettingsService('/fake/path', (rootPath, defaults) =>
        openMemorySettingsStore(rootPath, {
          ...defaults,
          settings: { ...defaults.settings, theme: 'light' },
        }),
      );
      expect(service.get('settings.theme')).toBe('light');
    });
  });
});
