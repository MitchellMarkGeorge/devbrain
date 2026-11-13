import { ChangeListeners, type ChangeListener } from '../shared/changes';
import { getDefaults, isRecord } from './defaults';
import type { OpenSettingsStore, SettingsStore } from './store';
import type { AppSettings, SettingsFile } from '@common/types';
import type { DotPathValue, DotPaths } from './types';

// The user's settings changed (a write under `settings`, or a reset), with all of them as they are
// now. A write to the app's state beside them sends nothing.
export type SettingsChange = { type: 'updated'; settings: AppSettings };

export class SettingsService {
  private store: SettingsStore;
  private readonly changes = new ChangeListeners<SettingsChange>('Settings');

  constructor(
    private readonly rootPath: string,
    openStore: OpenSettingsStore,
  ) {
    const defaults = getDefaults(rootPath);
    this.store = openStore(rootPath, defaults);
    this.fillMissing(defaults);
  }

  onChange(listener: ChangeListener<SettingsChange>): () => void {
    return this.changes.add(listener);
  }

  get<P extends DotPaths<SettingsFile>>(key: P): DotPathValue<SettingsFile, P> {
    return this.store.get(key) as DotPathValue<SettingsFile, P>;
  }

  set<P extends DotPaths<SettingsFile>>(key: P, value: DotPathValue<SettingsFile, P>): void {
    this.store.set(key, value);
    if (key === 'settings' || key.startsWith('settings.')) this.emitUpdated();
  }

  // puts every user setting back to its default; the app's state (the last workspace) is kept
  reset(): void {
    this.store.set('settings', getDefaults(this.rootPath).settings);
    this.emitUpdated();
  }

  // Writes the default of every key the file lacks, at any depth, as `withDefaults` reads them.
  // electron-store fills in defaults only at the top level, so a file written before a setting was
  // added has its group without it (`settings.calendar` with no `hideWeekends`), and reads would
  // return it missing. Filling them in when the file opens gives every new setting its default,
  // with nothing to do per key. A value the file has is never replaced.
  private fillMissing(defaults: Record<string, unknown>, prefix = ''): void {
    for (const [key, value] of Object.entries(defaults)) {
      const path = prefix ? `${prefix}.${key}` : key;
      const stored = this.store.get(path);
      if (stored === undefined) this.store.set(path, value);
      else if (isRecord(value) && isRecord(stored)) this.fillMissing(value, path);
    }
  }

  private emitUpdated(): void {
    this.changes.emit({ type: 'updated', settings: this.get('settings') });
  }
}
