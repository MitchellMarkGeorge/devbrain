import { ChangeListeners, type ChangeListener } from '../shared/changes';
import { getDefaults } from './defaults';
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
    this.store = openStore(rootPath, getDefaults(rootPath));
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

  // puts every user setting back to its default; the app's state (the last workspace, the last
  // page) is kept
  reset(): void {
    this.store.set('settings', getDefaults(this.rootPath).settings);
    this.emitUpdated();
  }

  private emitUpdated(): void {
    this.changes.emit({ type: 'updated', settings: this.get('settings') });
  }
}
