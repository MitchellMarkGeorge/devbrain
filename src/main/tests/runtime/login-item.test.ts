import { describe, expect, it, vi } from 'vitest';
import type { LoginItemSettings, Settings as LoginItemSettingsInput } from 'electron';
import { SettingsService } from '@main/core/settings/service';
import { openMemorySettingsStore } from '@main/core/tests/__mocks__/memory-settings-store';
import {
  applyLaunchAtLogin,
  followLaunchAtLogin,
  supportsLoginItem,
  type LoginItemApp,
} from '../../runtime/login-item';

// a login item the OS keeps in memory: set changes what get reports
function fakeApp(openAtLogin = false) {
  const state = { openAtLogin };
  const app = {
    getLoginItemSettings: vi.fn(() => ({ openAtLogin: state.openAtLogin }) as LoginItemSettings),
    setLoginItemSettings: vi.fn((settings: LoginItemSettingsInput) => {
      state.openAtLogin = settings.openAtLogin ?? false;
    }),
  } satisfies LoginItemApp;
  return { app, state };
}

// Windows: the Run key is still there, but the user turned DevBrain off in Startup apps
function fakeWindowsAppTurnedOff() {
  const app = {
    getLoginItemSettings: vi.fn(
      () => ({ openAtLogin: true, executableWillLaunchAtLogin: false }) as LoginItemSettings,
    ),
    setLoginItemSettings: vi.fn(),
  } satisfies LoginItemApp;
  return app;
}

const logger = () => ({ warn: vi.fn() });
const settingsService = () => new SettingsService('/fake/path', openMemorySettingsStore);

describe('supportsLoginItem', () => {
  it('is true only for a packaged app on macOS or Windows', () => {
    expect(supportsLoginItem('darwin', true)).toBe(true);
    expect(supportsLoginItem('win32', true)).toBe(true);
    expect(supportsLoginItem('linux', true)).toBe(false);
    expect(supportsLoginItem('darwin', false)).toBe(false);
  });
});

describe('applyLaunchAtLogin', () => {
  it('registers and removes the login item', () => {
    const { app, state } = fakeApp(false);
    applyLaunchAtLogin(app, true, logger());
    expect(state.openAtLogin).toBe(true);
    applyLaunchAtLogin(app, false, logger());
    expect(state.openAtLogin).toBe(false);
  });

  it('leaves the OS alone when it already matches', () => {
    const { app } = fakeApp(true);
    applyLaunchAtLogin(app, true, logger());
    expect(app.setLoginItemSettings).not.toHaveBeenCalled();
  });

  it('turns the login item back on when Windows has it turned off in Startup apps', () => {
    const app = fakeWindowsAppTurnedOff();
    applyLaunchAtLogin(app, true, logger());
    expect(app.setLoginItemSettings).toHaveBeenCalledWith({ openAtLogin: true });
  });

  it('logs a failure without throwing', () => {
    const { app } = fakeApp(false);
    app.setLoginItemSettings.mockImplementation(() => {
      throw new TypeError('denied');
    });
    const log = logger();
    expect(() => applyLaunchAtLogin(app, true, log)).not.toThrow();
    expect(log.warn).toHaveBeenCalledWith(
      'Login item update failed openAtLogin=true error=TypeError',
    );
  });
});

describe('followLaunchAtLogin', () => {
  it('takes the OS state into the setting at startup', () => {
    const settings = settingsService();
    followLaunchAtLogin(fakeApp(true).app, settings, logger());
    expect(settings.get('settings.general.launchOnStartup')).toBe(true);
  });

  it('keeps a login item the user removed outside DevBrain removed', () => {
    const settings = settingsService();
    settings.set('settings.general.launchOnStartup', true);
    const { app, state } = fakeApp(false);
    followLaunchAtLogin(app, settings, logger());
    expect(settings.get('settings.general.launchOnStartup')).toBe(false);
    expect(state.openAtLogin).toBe(false);
  });

  it('reads a login item turned off in Windows Startup apps as off', () => {
    const settings = settingsService();
    settings.set('settings.general.launchOnStartup', true);
    followLaunchAtLogin(fakeWindowsAppTurnedOff(), settings, logger());
    expect(settings.get('settings.general.launchOnStartup')).toBe(false);
  });

  it('applies each later change of the setting', () => {
    const settings = settingsService();
    const { app, state } = fakeApp(false);
    followLaunchAtLogin(app, settings, logger());

    settings.set('settings.general.launchOnStartup', true);
    expect(state.openAtLogin).toBe(true);
    settings.set('settings.general', {
      ...settings.get('settings.general'),
      launchOnStartup: false,
    });
    expect(state.openAtLogin).toBe(false);
  });

  it('removes the login item when the settings are reset', () => {
    const settings = settingsService();
    const { app, state } = fakeApp(false);
    followLaunchAtLogin(app, settings, logger());
    settings.set('settings.general.launchOnStartup', true);

    settings.reset();
    expect(state.openAtLogin).toBe(false);
  });

  it('ignores changes to other settings', () => {
    const settings = settingsService();
    const { app } = fakeApp(false);
    followLaunchAtLogin(app, settings, logger());
    settings.set('settings.theme', 'dark');
    expect(app.setLoginItemSettings).not.toHaveBeenCalled();
  });
});
