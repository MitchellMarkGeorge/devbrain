import { contextBridge, ipcRenderer } from 'electron';
import type { IpcRendererEvent } from 'electron';
import {
  IPC_INITIAL_LOAD_CONTEXT_CHANNEL,
  IPC_BRIDGE_KEY,
  IPC_CALL_CHANNEL,
  IPC_EVENT_PREFIX,
} from '@common/ipc/constants';
import type { InitialLoadContext, IpcBridge } from '@common/ipc/types';
import type { WorkspaceSnapshot } from '@common/types';

// The renderer's only way to main: a generic bridge, with nothing in it per route. The typed client
// (src/renderer/ipc) builds the requests; main checks them, as it trusts nothing from the renderer.
// The preload runs sandboxed, as CommonJS, so its bundle may require nothing but 'electron': what
// it imports from src/common is bundled in.

export function createBridge(): IpcBridge {
  // listening before the read below: a change sent while main answers it is buffered, never lost
  const workspaceState = bufferWorkspaceState();
  const initialLoadContext = readInitialLoadContext();
  workspaceState.offer(snapshotIn(initialLoadContext));
  return {
    invoke(request) {
      return ipcRenderer.invoke(IPC_CALL_CHANNEL, request);
    },
    subscribe(name, listener) {
      return listen(name, listener);
    },
    initialLoadContext,
    workspaceState: { get: workspaceState.get, subscribe: workspaceState.subscribe },
    // the sandboxed preload's process has the platform, unlike the page
    platform: process.platform,
  };
}

// Calls `listener` with each payload of the event `name`; returns the function that stops.
function listen(name: string, listener: (payload: unknown) => void): () => void {
  const channel = `${IPC_EVENT_PREFIX}${name}`;
  // the renderer gets the payload only, never the event, which would reach ipcRenderer
  const handler = (_event: IpcRendererEvent, payload: unknown) => listener(payload);
  ipcRenderer.on(channel, handler);
  return () => {
    ipcRenderer.removeListener(channel, handler);
  };
}

/**
 * The newest workspace state main has given, by version: from `workspace.changed`, listened to
 * from the start, and the initial load context's, offered once it is read. A change main sent
 * before it answered the synchronous read arrives after it and is older, so it is dropped.
 */
function bufferWorkspaceState() {
  let newest: WorkspaceSnapshot | null = null;
  const listeners = new Set<(snapshot: WorkspaceSnapshot) => void>();
  const offer = (snapshot: WorkspaceSnapshot | null) => {
    if (snapshot === null || (newest !== null && snapshot.version <= newest.version)) return;
    newest = snapshot;
    listeners.forEach((listener) => listener(snapshot));
  };
  listen('workspace.changed', (payload) => offer(payload as WorkspaceSnapshot));
  return {
    offer,
    get: () => newest,
    subscribe(listener: (snapshot: WorkspaceSnapshot) => void) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
}

// the workspace state in an initial load context, or null when main gave none
function snapshotIn(context: unknown): WorkspaceSnapshot | null {
  if (typeof context !== 'object' || context === null || !('workspace' in context)) return null;
  return (context as InitialLoadContext).workspace;
}

// Asked once per page load, synchronously as the preload runs, so the value is there before any
// page script. Main answers from what it holds in memory and the registry file, so the wait is
// short; the window is shown only once the page has painted, so nothing is seen while it lasts.
function readInitialLoadContext(): unknown {
  try {
    return ipcRenderer.sendSync(IPC_INITIAL_LOAD_CONTEXT_CHANNEL);
  } catch {
    return null;
  }
}

export function exposeBridge(): void {
  contextBridge.exposeInMainWorld(IPC_BRIDGE_KEY, createBridge());
}

exposeBridge();
