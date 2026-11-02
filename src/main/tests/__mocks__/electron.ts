// What tests see when they import 'electron' (vitest.config.ts aliases it here): in Node the real
// package exports only the path to the Electron binary. It covers what the IPC layer uses. Handlers
// registered with ipcMain.handle are kept in ipcHandlers, so a test can call one as a renderer would.
// The renderer half (ipcRenderer, contextBridge) is for the preload's tests.

import { vi } from 'vitest';
import type { BrowserWindow as ElectronBrowserWindow, IpcMainInvokeEvent } from 'electron';

type Handler = (event: IpcMainInvokeEvent, ...args: unknown[]) => unknown;
type Listener = (event: { returnValue: unknown }, ...args: unknown[]) => void;

export const ipcHandlers = new Map<string, Handler>();
export const ipcListeners = new Map<string, Listener>();

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
  on: vi.fn((channel: string, listener: Listener) => {
    if (ipcListeners.has(channel))
      throw new Error(`Attempted to register a second listener for '${channel}'`);
    ipcListeners.set(channel, listener);
  }),
  removeListener: vi.fn((channel: string, listener: Listener) => {
    if (ipcListeners.get(channel) === listener) ipcListeners.delete(channel);
  }),
};

export const app = {
  getVersion: vi.fn(() => '0.0.0-test'),
  isPackaged: false,
};

export const ipcRenderer = {
  sendSync: vi.fn<(channel: string, ...args: unknown[]) => unknown>(() => undefined),
  invoke: vi.fn<(channel: string, ...args: unknown[]) => Promise<unknown>>(async () => undefined),
  on: vi.fn(),
  removeListener: vi.fn(),
};

export const contextBridge = {
  exposeInMainWorld: vi.fn(),
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

/** Calls a listener registered with ipcMain.on and returns its synchronous answer. */
export function sendSyncToMain(channel: string, ...args: unknown[]): unknown {
  const listener = ipcListeners.get(channel);
  if (listener === undefined) throw new Error(`No listener registered for '${channel}'`);
  const event = { returnValue: undefined as unknown };
  listener(event, ...args);
  return event.returnValue;
}

/** Removes every handler and clears the mocks' calls and implementations set by a test. */
export function resetElectronMock(): void {
  ipcHandlers.clear();
  ipcListeners.clear();
  ipcMain.handle.mockClear();
  ipcMain.removeHandler.mockClear();
  ipcMain.on.mockClear();
  ipcMain.removeListener.mockClear();
  ipcRenderer.sendSync.mockReset();
  ipcRenderer.sendSync.mockImplementation(() => undefined);
  ipcRenderer.invoke.mockReset();
  ipcRenderer.invoke.mockImplementation(async () => undefined);
  ipcRenderer.on.mockReset();
  ipcRenderer.removeListener.mockReset();
  contextBridge.exposeInMainWorld.mockReset();
  BrowserWindow.getAllWindows.mockReset();
  BrowserWindow.getAllWindows.mockImplementation(() => []);
}
