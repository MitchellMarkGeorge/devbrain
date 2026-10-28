import { IPC_BRIDGE_KEY } from '@common/ipc/constants';
import type { IpcBridge } from '@common/ipc/types';

// window.ipcBridge, read when a call is made: there is no window when a test imports this
export function defaultBridge(): IpcBridge {
  const bridge = (globalThis as unknown as Record<string, IpcBridge | undefined>)[IPC_BRIDGE_KEY];
  if (bridge === undefined) {
    throw new Error(
      `No IPC bridge on window.${IPC_BRIDGE_KEY}: check that src/preload/index.ts ran (exposeBridge)`,
    );
  }
  return bridge;
}
