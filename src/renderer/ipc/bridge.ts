import { IPC_BRIDGE_KEY } from '@common/ipc/constants';
import type { IpcBridge } from '@common/ipc/types';

// window.ipcBridge, read when a call is made: there is no window when a test imports this
export function defaultBridge(): IpcBridge {
  return (globalThis as unknown as Record<string, IpcBridge>)[IPC_BRIDGE_KEY];
}
