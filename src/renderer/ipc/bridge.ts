import type { IpcBridge } from '@common/ipc/types';

// the bridge src/preload/index.ts exposes, read when a call is made
export function defaultBridge(): IpcBridge {
  if (!window.ipcBridge) {
    throw new Error('No IPC bridge on window.ipcBridge: check that src/preload/index.ts ran');
  }
  return window.ipcBridge;
}
