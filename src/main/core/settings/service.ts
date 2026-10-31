import { getDefaults } from './defaults';
import type { OpenSettingsStore, SettingsStore } from './store';
import type { DotPathValue, DotPaths, SettingsFile } from './types';

export class SettingsService {
  private store: SettingsStore;
  private defaults: SettingsFile;

  constructor(rootPath: string, openStore: OpenSettingsStore) {
    this.defaults = getDefaults(rootPath);
    this.store = openStore(rootPath, this.defaults);
    writeMissingDefaults(this.store, this.defaults);
  }

  get<P extends DotPaths<SettingsFile>>(key: P): DotPathValue<SettingsFile, P> {
    return this.store.get(key) as DotPathValue<SettingsFile, P>;
  }

  set<P extends DotPaths<SettingsFile>>(key: P, value: DotPathValue<SettingsFile, P>): void {
    this.store.set(key, value);
  }

  reset(): void {
    this.store.clear();
    writeMissingDefaults(this.store, this.defaults);
  }
}

// Writes each default the file lacks, such as a setting added after the file was written.
// electron-store fills in its defaults at the top level only, so a stored `settings` object hides
// every default inside it.
function writeMissingDefaults(store: SettingsStore, defaults: object, prefix = ''): void {
  for (const [key, value] of Object.entries(defaults)) {
    const path = prefix ? `${prefix}.${key}` : key;
    const stored = store.get(path);
    if (stored === undefined) store.set(path, value);
    else if (isPlainObject(value) && isPlainObject(stored))
      writeMissingDefaults(store, value, path);
  }
}

function isPlainObject(value: unknown): value is object {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}
