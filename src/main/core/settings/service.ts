import { getDefaults } from './defaults';
import type { OpenSettingsStore, SettingsStore } from './store';
import type { DotPathValue, DotPaths, SettingsFile } from './types';

export class SettingsService {
  private store: SettingsStore;
  constructor(rootPath: string, openStore: OpenSettingsStore) {
    this.store = openStore(rootPath, getDefaults(rootPath));
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
