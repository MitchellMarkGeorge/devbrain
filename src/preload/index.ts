import { contextBridge, ipcRenderer } from 'electron';
import type { IpcRendererEvent } from 'electron';
import {
  IPC_BOOT_CHANNEL,
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
    // Synchronous, so the page's first render has it. Main answers from what it holds in memory and
    // the registry file, so the wait is short, and it is asked once per page load
    boot() {
      return ipcRenderer.sendSync(IPC_BOOT_CHANNEL);
    },
  };
}

export function exposeBridge(): void {
  contextBridge.exposeInMainWorld(IPC_BRIDGE_KEY, createBridge());
}

exposeBridge();
