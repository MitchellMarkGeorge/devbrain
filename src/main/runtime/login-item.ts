import type { App, LoginItemSettings } from 'electron';
import type { DevBrain } from '@main/core';
import type { SyncLogger } from '@main/core/sync/types';

// Keeps the general.launchOnStartup setting and the OS login item in step. Electron's app is passed
// in, typed down to the two calls used, so tests can pass a fake.

export type LoginItemApp = Pick<App, 'getLoginItemSettings' | 'setLoginItemSettings'>;
type Settings = Pick<DevBrain['settings'], 'get' | 'set' | 'onChange'>;
type Logger = Pick<SyncLogger, 'warn'>;

// Electron manages login items on macOS and Windows only. In development the item would open the
// bare Electron binary, not DevBrain, so only a packaged app registers one.
export function supportsLoginItem(platform: NodeJS.Platform, isPackaged: boolean): boolean {
  return isPackaged && (platform === 'darwin' || platform === 'win32');
}

// Whether the app will open at login. On Windows, turning DevBrain off in Startup apps keeps its
// Run key, so openAtLogin stays true; executableWillLaunchAtLogin, reported on Windows only, says
// whether it is still on.
function opensAtLogin(settings: LoginItemSettings): boolean {
  return settings.executableWillLaunchAtLogin ?? settings.openAtLogin;
}

// Registers or removes the login item, when the OS doesn't already have it that way. Never throws:
// a failure is logged, and the setting stays as the user chose it.
export function applyLaunchAtLogin(app: LoginItemApp, openAtLogin: boolean, logger: Logger): void {
  try {
    if (opensAtLogin(app.getLoginItemSettings()) === openAtLogin) return;
    app.setLoginItemSettings({ openAtLogin });
  } catch (error) {
    const name = error instanceof Error ? error.name : typeof error;
    logger.warn(`Login item update failed openAtLogin=${openAtLogin} error=${name}`);
  }
}

/**
 * At startup the setting takes the OS's state, so a login item the user removed in System Settings
 * (or the Windows Startup apps list) stays removed and the toggle shows it. From then on, each
 * change to the setting is applied to the OS.
 */
export function followLaunchAtLogin(app: LoginItemApp, settings: Settings, logger: Logger): void {
  try {
    const openAtLogin = opensAtLogin(app.getLoginItemSettings());
    if (settings.get('settings.general.launchOnStartup') !== openAtLogin) {
      settings.set('settings.general.launchOnStartup', openAtLogin);
    }
  } catch (error) {
    const name = error instanceof Error ? error.name : typeof error;
    logger.warn(`Login item read failed error=${name}`);
  }
  settings.onChange(({ settings: { general } }) =>
    applyLaunchAtLogin(app, general.launchOnStartup, logger),
  );
}
