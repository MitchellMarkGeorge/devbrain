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
        workspaceState: { get: expect.any(Function), subscribe: expect.any(Function) },
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
    const [channel, handler] = ipcRenderer.on.mock.calls.at(-1)!;

    handler({ sender: 'the IpcRendererEvent' }, { entities: ['task'] });
    off();

    expect(channel).toBe('ipc-event:db.changes');
    expect(listener).toHaveBeenCalledWith({ entities: ['task'] });
    expect(ipcRenderer.removeListener).toHaveBeenCalledWith('ipc-event:db.changes', handler);
  });
});

describe("the preload's workspace state", () => {
  afterEach(() => resetElectronMock());

  const snapshot = (version: number, status: 'none' | 'opening') => ({
    version,
    state: status === 'none' ? { status, error: null } : { status, workspace: { id: 'wsp_1' } },
  });
  // what main sends on workspace.changed, through the listener the preload added first
  const send = (payload: unknown) => {
    const [channel, handler] = ipcRenderer.on.mock.calls[0];
    expect(channel).toBe('ipc-event:workspace.changed');
    handler({}, payload);
  };

  it('starts from the initial load context', () => {
    ipcRenderer.sendSync.mockReturnValue({ workspace: snapshot(3, 'opening') });
    expect(createBridge().workspaceState.get()).toEqual(snapshot(3, 'opening'));
  });

  it('listens before it reads, so a change sent in between is kept', () => {
    ipcRenderer.sendSync.mockImplementation(() => {
      // main sends a change while it answers
      send(snapshot(4, 'none'));
      return { workspace: snapshot(3, 'opening') };
    });
    expect(createBridge().workspaceState.get()).toEqual(snapshot(4, 'none'));
  });

  it('passes each newer snapshot on, and drops an older one', () => {
    ipcRenderer.sendSync.mockReturnValue({ workspace: snapshot(3, 'opening') });
    const bridge = createBridge();
    const listener = vi.fn();
    bridge.workspaceState.subscribe(listener);

    send(snapshot(2, 'none'));
    send(snapshot(4, 'none'));
    expect(listener.mock.calls).toEqual([[snapshot(4, 'none')]]);
    expect(bridge.workspaceState.get()).toEqual(snapshot(4, 'none'));
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
