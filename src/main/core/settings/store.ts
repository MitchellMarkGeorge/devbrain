import type { SettingsFile } from './types';

// The file a DevBrain folder's settings are kept in, read and written by dot-separated key, e.g.
// "settings.general.timeFormat". The main process opens it with electron-store; tests pass one in
// memory.
export interface SettingsStore {
  get(key: string): unknown;
  set(key: string, value: unknown): void;
  // forgets every value, so the defaults are read again
  clear(): void;
}

// opens the settings of the DevBrain folder at `rootPath`; a new file starts from `defaults`
export type OpenSettingsStore = (rootPath: string, defaults: SettingsFile) => SettingsStore;
