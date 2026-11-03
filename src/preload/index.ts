import { contextBridge, ipcRenderer } from 'electron';
import type { IpcRendererEvent } from 'electron';
import {
  IPC_INITIAL_LOAD_CONTEXT_CHANNEL,
  IPC_BRIDGE_KEY,
  IPC_CALL_CHANNEL,
  IPC_EVENT_PREFIX,
} from '@common/ipc/constants';
import type { IpcBridge } from '@common/ipc/types';

// The renderer's only way to main: a generic bridge, with nothing in it per route. The typed client
// (src/renderer/ipc) builds the requests; main checks them, as it trusts nothing from the renderer.
// The preload runs sandboxed, as CommonJS, so its bundle may require nothing but 'electron': what
// it imports from src/common is bundled in.

export function createBridge(): IpcBridge {
  return {
    invoke(request) {
      return ipcRenderer.invoke(IPC_CALL_CHANNEL, request);
    },
    subscribe(name, listener) {
      const channel = `${IPC_EVENT_PREFIX}${name}`;
      // the renderer gets the payload only, never the event, which would reach ipcRenderer
      const handler = (_event: IpcRendererEvent, payload: unknown) => listener(payload);
      ipcRenderer.on(channel, handler);
      return () => {
        ipcRenderer.removeListener(channel, handler);
      };
    },
    initialLoadContext: readInitialLoadContext(),
  };
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
