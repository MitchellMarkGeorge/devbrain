import { ChangeListener, ChangeListeners } from '../shared/changes';
import type { Logger } from '../shared/logger';
import { getDefaults } from './defaults';
import type { OpenSettingsStore, SettingsStore } from './store';
import type { DotPathValue, DotPaths, SettingsFile } from './types';

// What a write changed, for in-process subscribers such as the IPC layer forwarding it to the
// renderer: the dot path set, or the whole file reset to its defaults. Sent after the write.
export type SettingsChange = { type: 'updated'; key: DotPaths<SettingsFile> } | { type: 'reset' };

export interface SettingsServiceOptions {
  // where a change listener's error is logged; defaults to the console
  logger?: Pick<Logger, 'error'>;
}

export class SettingsService {
  private store: SettingsStore;
  private readonly changes: ChangeListeners<SettingsChange>;

  constructor(
    rootPath: string,
    openStore: OpenSettingsStore,
    options: SettingsServiceOptions = {},
  ) {
    this.store = openStore(rootPath, getDefaults(rootPath));
    this.changes = new ChangeListeners('Settings', { logger: options.logger });
  }

  // returns a function that unsubscribes the listener
  onChange(listener: ChangeListener<SettingsChange>): () => void {
    return this.changes.add(listener);
  }

  get<P extends DotPaths<SettingsFile>>(key: P): DotPathValue<SettingsFile, P> {
    return this.store.get(key) as DotPathValue<SettingsFile, P>;
  }

  set<P extends DotPaths<SettingsFile>>(key: P, value: DotPathValue<SettingsFile, P>): void {
    this.store.set(key, value);
    this.changes.emit({ type: 'updated', key });
  }

  reset(): void {
    this.store.clear();
    this.changes.emit({ type: 'reset' });
  }
}
