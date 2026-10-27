import { afterEach, describe, expect, it } from 'vitest';
import type { IpcMainInvokeEvent } from 'electron';
import { BrowserWindow, ipcMain } from 'electron';
import { invokeHandler, resetElectronMock } from '../__mocks__/electron';

// the IPC layer's tests rely on 'electron' resolving to the mock (vitest.config.ts)
describe('the electron mock', () => {
  afterEach(() => resetElectronMock());

  const event = {} as IpcMainInvokeEvent;

  it('keeps the handlers registered with ipcMain.handle', async () => {
    ipcMain.handle('ipc:app.ping', () => 'pong');

    expect(await invokeHandler('ipc:app.ping', event)).toBe('pong');
  });

  it('throws on a second handler for a channel, as Electron does', () => {
    ipcMain.handle('ipc:app.ping', () => 'pong');

    expect(() => ipcMain.handle('ipc:app.ping', () => 'pong')).toThrow(/second handler/);
  });

  it('forgets a handler once removed', async () => {
    ipcMain.handle('ipc:app.ping', () => 'pong');
    ipcMain.removeHandler('ipc:app.ping');

    await expect(invokeHandler('ipc:app.ping', event)).rejects.toThrow(/No handler/);
  });

  it('has no windows unless a test gives it some', () => {
    expect(BrowserWindow.getAllWindows()).toEqual([]);
  });
});
