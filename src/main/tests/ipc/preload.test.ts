import { afterEach, describe, expect, it, vi } from 'vitest';
import { build } from 'vite';
import type { Rolldown } from 'vite';
import { createBridge } from '../../../preload';
import { contextBridge, ipcRenderer, resetElectronMock } from '../__mocks__/electron';

// the call importing the preload made, before afterEach resets the mock
const exposedOnImport = contextBridge.exposeInMainWorld.mock.calls[0];

describe('the preload bridge', () => {
  afterEach(() => resetElectronMock());

  it('is exposed on window under ipcBridge when the preload is imported', () => {
    expect(exposedOnImport).toEqual([
      'ipcBridge',
      {
        invoke: expect.any(Function),
        subscribe: expect.any(Function),
        // the mock's sendSync answers nothing at import
        initialLoadContext: undefined,
        platform: process.platform,
      },
    ]);
  });

  it('holds the initial load context, read once on its channel as the bridge is built', () => {
    const context = { devBrainAvailable: false };
    ipcRenderer.sendSync.mockReturnValue(context);

    const bridge = createBridge();
    expect(bridge.initialLoadContext).toBe(context);
    expect(bridge.initialLoadContext).toBe(context);
    expect(ipcRenderer.sendSync).toHaveBeenCalledOnce();
    expect(ipcRenderer.sendSync).toHaveBeenCalledWith('ipc:initial-load-context');
  });

  it('holds null when the read fails, so the page fetches instead', () => {
    ipcRenderer.sendSync.mockImplementation(() => {
      throw new Error('no reply');
    });

    expect(createBridge().initialLoadContext).toBeNull();
  });

  it('invokes the call channel with the request', async () => {
    const result = { ok: true, data: 'pong', changed: [] };
    ipcRenderer.invoke.mockResolvedValue(result);
    const request = { path: 'app.ping', type: 'query' as const, input: 1 };

    expect(await createBridge().invoke(request)).toBe(result);
    expect(ipcRenderer.invoke).toHaveBeenCalledWith('ipc:call', request);
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
