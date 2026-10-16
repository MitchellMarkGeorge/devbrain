// A settings store that keeps its data in a plain object, so tests need no Electron or disk I/O.

import type { OpenSettingsStore, SettingsStore } from '../../settings/store';

class MemoryStore implements SettingsStore {
  private data: Record<string, unknown>;

  constructor(defaults: object) {
    this.data = structuredClone(defaults) as Record<string, unknown>;
  }

  get(key: string): unknown {
    return key.split('.').reduce<unknown>((obj, k) => {
      if (obj !== null && typeof obj === 'object') {
        return (obj as Record<string, unknown>)[k];
      }
      return undefined;
    }, this.data);
  }

  set(key: string, value: unknown): void {
    const parts = key.split('.');
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let cursor: any = this.data;
    for (let i = 0; i < parts.length - 1; i++) {
      if (cursor[parts[i]] === undefined) cursor[parts[i]] = {};
      cursor = cursor[parts[i]];
    }
    cursor[parts[parts.length - 1]] = value;
  }

  clear(): void {
    this.data = {};
  }
}

export const openMemorySettingsStore: OpenSettingsStore = (_rootPath, defaults) =>
  new MemoryStore(defaults);
