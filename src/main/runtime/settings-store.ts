import Store from 'electron-store';
import type { OpenSettingsStore } from '@main/core';
import type { SettingsFile } from '@main/core/settings/types';

// the DevBrain folder's settings.json, through electron-store
export const openElectronSettingsStore: OpenSettingsStore = (rootPath, defaults) =>
  new Store<SettingsFile>({ name: 'settings', cwd: rootPath, defaults });
