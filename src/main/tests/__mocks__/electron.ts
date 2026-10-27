// What tests see when they import 'electron' (vitest.config.ts aliases it here): in Node the real
// package exports only the path to the Electron binary. It covers what the IPC layer uses. Handlers
// registered with ipcMain.handle are kept in ipcHandlers, so a test can call one as a renderer would.

import { vi } from 'vitest';
import type { BrowserWindow as ElectronBrowserWindow, IpcMainInvokeEvent } from 'electron';

type Handler = (event: IpcMainInvokeEvent, ...args: unknown[]) => unknown;

export const ipcHandlers = new Map<string, Handler>();

export const ipcMain = {
  // Electron throws on a second handler for the same channel; so does the mock
  handle: vi.fn((channel: string, listener: Handler) => {
    if (ipcHandlers.has(channel)) {
      throw new Error(`Attempted to register a second handler for '${channel}'`);
    }
    ipcHandlers.set(channel, listener);
  }),
  removeHandler: vi.fn((channel: string) => {
    ipcHandlers.delete(channel);
  }),
};

export const BrowserWindow = {
  getAllWindows: vi.fn((): ElectronBrowserWindow[] => []),
};

/** Calls the handler registered for `channel`, as `ipcRenderer.invoke` would. */
export async function invokeHandler(
  channel: string,
  event: IpcMainInvokeEvent,
  ...args: unknown[]
): Promise<unknown> {
  const handler = ipcHandlers.get(channel);
  if (handler === undefined) throw new Error(`No handler registered for '${channel}'`);
  return handler(event, ...args);
}

/** Removes every handler and clears the mocks' calls and implementations set by a test. */
export function resetElectronMock(): void {
  ipcHandlers.clear();
  ipcMain.handle.mockClear();
  ipcMain.removeHandler.mockClear();
  BrowserWindow.getAllWindows.mockReset();
  BrowserWindow.getAllWindows.mockImplementation(() => []);
}
