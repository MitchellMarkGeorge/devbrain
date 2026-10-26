// Manual mock for electron-store — used by SettingsService tests.
// Stores data in a plain object so tests don't need Electron or disk I/O.

type StoreOptions<T extends Record<string, unknown>> = {
  defaults?: T;
  name?: string;
  cwd?: string;
};

class MockStore<T extends Record<string, unknown>> {
  private data: Record<string, unknown>;

  constructor(opts: StoreOptions<T> = {}) {
    this.data = structuredClone(opts.defaults ?? {});
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

export default MockStore;
