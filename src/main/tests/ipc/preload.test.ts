import { afterEach, describe, expect, it, vi } from 'vitest';
import { build } from 'vite';
import type { Rolldown } from 'vite';
import { createBridge } from '../../../preload';
import { contextBridge, ipcRenderer, resetElectronMock } from '../__mocks__/electron';

describe('the preload bridge', () => {
  afterEach(() => resetElectronMock());

  it('is exposed on window under ipcBridge', async () => {
    vi.resetModules();
    await import('../../../preload');

    expect(contextBridge.exposeInMainWorld).toHaveBeenCalledWith('ipcBridge', {
      invoke: expect.any(Function),
      subscribe: expect.any(Function),
    });
  });

  it('invokes a path on its own channel, with the input', async () => {
    const result = { ok: true, data: 'pong', changed: [] };
    ipcRenderer.invoke.mockResolvedValue(result);

    expect(await createBridge().invoke('app.ping', undefined)).toBe(result);
    expect(ipcRenderer.invoke).toHaveBeenCalledWith('ipc:app.ping', undefined);
  });

  it.each(['../secret', 'app:ping', '', 'a b'])("rejects the path '%s'", (path) => {
    expect(() => createBridge().invoke(path, undefined)).toThrow(/Invalid IPC path/);
    expect(ipcRenderer.invoke).not.toHaveBeenCalled();
  });

  it('passes listeners the payload only, and unsubscribes', () => {
    const listener = vi.fn();
    const off = createBridge().subscribe('db.changes', listener);
    const [channel, handler] = ipcRenderer.on.mock.calls[0];

    handler({ sender: 'the IpcRendererEvent' }, { entities: ['task'] });
    off();

    expect(channel).toBe('ipc-event:db.changes');
    expect(listener).toHaveBeenCalledWith({ entities: ['task'] });
    expect(ipcRenderer.removeListener).toHaveBeenCalledWith('ipc-event:db.changes', handler);
  });

  it('rejects an event name outside the allowed characters', () => {
    expect(() => createBridge().subscribe('db/changes', vi.fn())).toThrow(/Invalid IPC event/);
    expect(ipcRenderer.on).not.toHaveBeenCalled();
  });
});

describe('the preload bundle', () => {
  // a sandboxed preload can require nothing but electron (and a few Node built-ins, not used here)
  it("requires only 'electron'", async () => {
    const result = (await build({
      configFile: 'vite/preload.config.ts',
      logLevel: 'silent',
      build: { write: false },
    })) as Rolldown.RolldownOutput | Rolldown.RolldownOutput[];
    const code = [result]
      .flat()
      .flatMap((output) => output.output)
      .filter((chunk) => chunk.type === 'chunk')
      .map((chunk) => chunk.code)
      .join('\n');

    const required = [...code.matchAll(/\brequire\(\s*["']([^"']+)["']\s*\)/g)].map((m) => m[1]);
    expect(new Set(required)).toEqual(new Set(['electron']));
    expect(code).not.toMatch(/\bimport\s*\(/);
  }, 30_000);
});
