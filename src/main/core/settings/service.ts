import type { DotPathValue, DotPaths, SettingsFile } from './types';
import Store from 'electron-store'; // do I need this? Should I just build my own lightweight version?
import { DEFAULTS } from './defaults';

export class SettingsService {
  private store: Store<SettingsFile>;
  constructor(rootPath: string) {
    this.store = new Store({
      name: 'settings',
      cwd: rootPath,
      defaults: DEFAULTS,
    });
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
