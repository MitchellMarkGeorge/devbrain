/// <reference types="vite/client" />

import type { IpcBridge } from '@common/ipc/types';

declare global {
  interface Window {
    // exposed by src/preload/index.ts under IPC_BRIDGE_KEY; called through src/renderer/ipc.
    // Absent outside the app: in Storybook and the renderer's tests
    ipcBridge?: IpcBridge;
  }
}

export {};
