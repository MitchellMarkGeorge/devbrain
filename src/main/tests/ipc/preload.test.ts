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
    // the bridge listens to workspace.changed itself first
    const [channel, handler] = ipcRenderer.on.mock.calls.find(
      ([name]) => name === 'ipc-event:db.changes',
    )!;

    handler({ sender: 'the IpcRendererEvent' }, { entities: ['task'] });
    off();

    expect(channel).toBe('ipc-event:db.changes');
    expect(listener).toHaveBeenCalledWith({ entities: ['task'] });
    expect(ipcRenderer.removeListener).toHaveBeenCalledWith('ipc-event:db.changes', handler);
  });
});

describe("the preload's workspace state", () => {
  afterEach(() => resetElectronMock());

  const snapshot = (version: number, status: 'none' | 'opening' = 'none') =>
    status === 'none'
      ? { version, state: { status, error: null } }
      : { version, state: { status, workspace: { id: 'wsp_a', name: 'A' } } };

  // sends workspace.changed as main would, to the listener the bridge registered
  function sendWorkspaceChanged(payload: unknown) {
    for (const [channel, handler] of ipcRenderer.on.mock.calls) {
      if (channel === 'ipc-event:workspace.changed') handler({}, payload);
    }
  }

  it('listens to workspace.changed before reading the initial load context', () => {
    const order: string[] = [];
    ipcRenderer.on.mockImplementation((channel: string) => void order.push(`on ${channel}`));
    ipcRenderer.sendSync.mockImplementation((channel: string) => {
      order.push(`sendSync ${channel}`);
      return { workspace: snapshot(1) };
    });

    createBridge();

    expect(order).toEqual(['on ipc-event:workspace.changed', 'sendSync ipc:initial-load-context']);
  });

  it("starts from the initial load context's state, and is null without one", () => {
    ipcRenderer.sendSync.mockReturnValue({ workspace: snapshot(3) });
    expect(createBridge().workspaceState.get()).toEqual(snapshot(3));

    ipcRenderer.sendSync.mockReturnValue(null);
    expect(createBridge().workspaceState.get()).toBeNull();
  });

  it('keeps a change sent during the read when it is newer', () => {
    ipcRenderer.sendSync.mockImplementation(() => {
      // main sent this after building the context it answers with
      sendWorkspaceChanged(snapshot(4, 'opening'));
      return { workspace: snapshot(3) };
    });

    expect(createBridge().workspaceState.get()).toEqual(snapshot(4, 'opening'));
  });

  it('drops older versions, and tells subscribers of newer ones only', () => {
    ipcRenderer.sendSync.mockReturnValue({ workspace: snapshot(5) });
    const bridge = createBridge();
    const listener = vi.fn();
    const off = bridge.workspaceState.subscribe(listener);

    // sent before main answered the read, so delivered after it
    sendWorkspaceChanged(snapshot(4, 'opening'));
    expect(bridge.workspaceState.get()).toEqual(snapshot(5));
    sendWorkspaceChanged(snapshot(6, 'opening'));
    off();
    sendWorkspaceChanged(snapshot(7));

    expect(listener.mock.calls).toEqual([[snapshot(6, 'opening')]]);
    expect(bridge.workspaceState.get()).toEqual(snapshot(7));
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
