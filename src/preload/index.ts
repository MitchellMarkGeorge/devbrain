import { contextBridge, ipcRenderer } from 'electron';
import type { IpcRendererEvent } from 'electron';
import {
  IPC_BRIDGE_KEY,
  IPC_CHANNEL_PREFIX,
  IPC_EVENT_PREFIX,
  IPC_NAME_PATTERN,
} from '@common/ipc/constants';
import type { IpcBridge, IpcResult } from '@common/ipc/types';

// The renderer's only way to main: a generic bridge, with nothing in it per route. The typed client
// (src/renderer/ipc) builds the paths. The preload runs sandboxed, as CommonJS, so its bundle may
// require nothing but 'electron': what it imports from src/common is bundled in.

function checkName(kind: string, name: unknown): asserts name is string {
  if (typeof name !== 'string' || !IPC_NAME_PATTERN.test(name)) {
    throw new Error(`Invalid IPC ${kind}: ${String(name)}`);
  }
}

export function createBridge(): IpcBridge {
  return {
    invoke(path, input) {
      checkName('path', path);
      return ipcRenderer.invoke(`${IPC_CHANNEL_PREFIX}${path}`, input) as Promise<
        IpcResult<unknown>
      >;
    },
    subscribe(name, listener) {
      checkName('event', name);
      const channel = `${IPC_EVENT_PREFIX}${name}`;
      // the renderer gets the payload only, never the event, which would reach ipcRenderer
      const handler = (_event: IpcRendererEvent, payload: unknown) => listener(payload);
      ipcRenderer.on(channel, handler);
      return () => {
        ipcRenderer.removeListener(channel, handler);
      };
    },
  };
}

export function exposeBridge(): void {
  contextBridge.exposeInMainWorld(IPC_BRIDGE_KEY, createBridge());
}

exposeBridge();
