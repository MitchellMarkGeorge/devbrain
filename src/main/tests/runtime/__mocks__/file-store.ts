// Stand-in for electron-store that keeps its data in `<cwd>/<name>.json`, as the real one does, so
// a setting written by one DevBrain is read by the next one opened on the same folder.

import fs from 'node:fs';
import path from 'node:path';
import type { OpenSettingsStore } from '@main/core';

type StoreOptions = { defaults?: Record<string, unknown>; name?: string; cwd?: string };

export default class FileStore {
  private readonly filePath: string;
  private data: Record<string, unknown>;

  constructor({ defaults = {}, name = 'config', cwd = '.' }: StoreOptions = {}) {
    this.filePath = path.join(cwd, `${name}.json`);
    this.data = fs.existsSync(this.filePath)
      ? JSON.parse(fs.readFileSync(this.filePath, 'utf8'))
      : structuredClone(defaults);
  }

  get(key: string): unknown {
    return key.split('.').reduce<unknown>((value, part) => {
      return value !== null && typeof value === 'object'
        ? (value as Record<string, unknown>)[part]
        : undefined;
    }, this.data);
  }

  set(key: string, value: unknown): void {
    const parts = key.split('.');
    let target = this.data;
    for (const part of parts.slice(0, -1)) {
      target[part] ??= {};
      target = target[part] as Record<string, unknown>;
    }
    target[parts[parts.length - 1]] = value;
    fs.writeFileSync(this.filePath, JSON.stringify(this.data, null, 2));
  }

  clear(): void {
    this.data = {};
    fs.writeFileSync(this.filePath, JSON.stringify(this.data, null, 2));
  }
}

// opens settings.json in the DevBrain folder, as the app's electron-store does
export const openFileSettingsStore: OpenSettingsStore = (rootPath, defaults) =>
  new FileStore({ name: 'settings', cwd: rootPath, defaults });
