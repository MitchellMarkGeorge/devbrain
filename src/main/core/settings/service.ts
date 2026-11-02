import { ChangeListeners, type ChangeListener } from '../shared/changes';
import { getDefaults } from './defaults';
import type { OpenSettingsStore, SettingsStore } from './store';
import type { AppSettings, DotPathValue, DotPaths, SettingsFile } from './types';

// The user's settings changed (a write under `settings`, or a reset), with all of them as they are
// now. A write to the app's state beside them sends nothing.
export type SettingsChange = { type: 'updated'; settings: AppSettings };

export class SettingsService {
  private store: SettingsStore;
  private readonly changes = new ChangeListeners<SettingsChange>('Settings');

  constructor(rootPath: string, openStore: OpenSettingsStore) {
    this.store = openStore(rootPath, getDefaults(rootPath));
    this.applySystemTheme();
  }

  // Before the system theme, 'dark' was the only theme, so no one chose it: it becomes 'system',
  // the default, once. Dark chosen after that stays.
  private applySystemTheme(): void {
    if (this.store.get('state.systemThemeApplied') === true) return;
    if (this.store.get('settings.theme') === 'dark') this.store.set('settings.theme', 'system');
    this.store.set('state.systemThemeApplied', true);
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

  reset(): void {
    this.store.clear();
    this.emitUpdated();
  }

  private emitUpdated(): void {
    this.changes.emit({ type: 'updated', settings: this.get('settings') });
  }
}
