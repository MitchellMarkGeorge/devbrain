import { getDefaults } from './defaults';
import type { DotPathValue, DotPaths, SettingsFile } from './types';
import Store from 'electron-store'; // do I need this? Should I just build my own lightweight version?

export class SettingsService {
  private store: Store<SettingsFile>;
  constructor(rootPath: string) {
    this.store = new Store({
      name: 'settings',
      cwd: rootPath,
      defaults: getDefaults(rootPath),
    });
    dropRemovedSettings(this.store);
  }

  get<P extends DotPaths<SettingsFile>>(key: P): DotPathValue<SettingsFile, P> {
    return this.store.get(key) as DotPathValue<SettingsFile, P>;
  }

  set<P extends DotPaths<SettingsFile>>(key: P, value: DotPathValue<SettingsFile, P>): void {
    this.store.set(key, value);
  }

  reset(): void {
    this.store.clear();
  }
}

// Settings older versions wrote that mean nothing now. electron-store keeps whatever a file holds,
// so they are deleted here. `calendar.timezone` went when dates moved to the system zone (see
// shared/dates.ts).
function dropRemovedSettings(store: Store<SettingsFile>): void {
  const calendar: Record<string, unknown> = { ...store.get('settings.calendar') };
  if (!('timezone' in calendar)) return;
  delete calendar.timezone;
  store.set('settings.calendar', calendar as SettingsFile['settings']['calendar']);
}
