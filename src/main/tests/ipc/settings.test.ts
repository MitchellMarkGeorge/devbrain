import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { DevBrain } from '@main/core';
import { ChangeTracker } from '@main/ipc/changes';
import { appRouter } from '@main/ipc/router';
import { attachRouter } from '@main/ipc/server';
import { resetElectronMock } from '../__mocks__/electron';
import { call, tempDevBrain, testContext } from './helpers';

// settings.set and settings.reset end to end, through the transport and a real ChangeTracker. A
// write under `settings` reports `settings` changed; the app's state is out of their reach.

let devBrain: DevBrain;
let cleanup: () => Promise<void>;

beforeEach(async () => {
  ({ devBrain, cleanup } = await tempDevBrain());
  const tracker = new ChangeTracker(vi.fn());
  tracker.watch(devBrain);
  attachRouter(appRouter, { createContext: testContext(devBrain), changeTracker: tracker });
});

afterEach(async () => {
  resetElectronMock();
  await cleanup();
});

const mutate = (path: string, input?: unknown) => call(path, input, 'mutation');

const code = (result: { ok: boolean }) =>
  (result as { error?: { data: { code: string } } }).error?.data.code;

describe('settings.set', () => {
  it('writes one setting, keeps the others, and returns every setting', async () => {
    const before = structuredClone(devBrain.settings.get('settings'));

    expect(
      await mutate('settings.set', { path: 'settings.general.timeFormat', value: '24' }),
    ).toEqual({
      ok: true,
      data: { ...before, general: { ...before.general, timeFormat: '24' } },
      changed: ['settings'],
    });
    expect(devBrain.settings.get('settings.general.timeFormat')).toBe('24');
  });

  it('writes a group of settings at once', async () => {
    const calendar = {
      ...devBrain.settings.get('settings.calendar'),
      defaultView: 'month' as const,
    };

    expect(
      await mutate('settings.set', { path: 'settings.calendar', value: calendar }),
    ).toMatchObject({ ok: true, data: { calendar }, changed: ['settings'] });
  });

  it('checks the value against the schema of its path, writing nothing when it fails', async () => {
    const before = structuredClone(devBrain.settings.get('settings'));
    const refused = [
      { path: 'settings.general.timeFormat', value: '13' },
      { path: 'settings.theme', value: true },
      // a group must be whole
      { path: 'settings.calendar', value: { defaultView: 'month' } },
      { path: 'settings.general.timeFormat' },
    ];
    for (const input of refused) {
      expect(await mutate('settings.set', input)).toMatchObject({
        ok: false,
        error: { data: { code: 'invalid_input' } },
        changed: [],
      });
    }
    expect(devBrain.settings.get('settings')).toEqual(before);
  });

  it('refuses paths outside the settings: the whole object, the app state, unknown keys', async () => {
    devBrain.settings.set('state.lastPage', '/app/tasks');
    const refused = [
      { path: 'settings', value: devBrain.settings.get('settings') },
      { path: 'state.lastPage', value: '/app/home' },
      { path: 'state.lastWorkspaceId', value: null },
      { path: 'settings.general.nope', value: true },
      { path: 'general.timeFormat', value: '24' },
    ];
    for (const input of refused) {
      expect(code(await mutate('settings.set', input))).toBe('invalid_input');
    }
    expect(devBrain.settings.get('state.lastPage')).toBe('/app/tasks');
  });
});

describe('settings.reset', () => {
  it('puts every setting back to its default, keeping the app state', async () => {
    const defaults = structuredClone(devBrain.settings.get('settings'));
    devBrain.settings.set('settings.theme', 'dark');
    devBrain.settings.set('settings.general.timeFormat', '24');
    devBrain.settings.set('state.lastPage', '/app/tasks');

    expect(await mutate('settings.reset')).toEqual({
      ok: true,
      data: defaults,
      changed: ['settings'],
    });
    expect(devBrain.settings.get('settings')).toEqual(defaults);
    expect(devBrain.settings.get('state.lastPage')).toBe('/app/tasks');
  });
});
