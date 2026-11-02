import { afterEach, describe, expect, it, vi } from 'vitest';
import type { DevBrain } from '@main/core';
import { attachBoot, bootSnapshot } from '../../ipc/boot';
import { ipcMain, resetElectronMock, sendSyncToMain } from '../__mocks__/electron';

describe('the boot snapshot', () => {
  afterEach(() => resetElectronMock());

  it('describes an unavailable DevBrain', () => {
    expect(bootSnapshot(null)).toEqual({
      devBrainAvailable: false,
      current: null,
      last: null,
      workspaces: null,
    });
  });

  it('includes the current workspace and first registry page', () => {
    const page = { items: [{ id: 'wsp_open' }], nextCursor: null };
    const devBrain = {
      currentWorkspace: { info: { id: 'wsp_open' } },
      workspaces: {
        listAll: vi.fn(() => page),
        getById: vi.fn(() => ({ id: 'wsp_open' })),
      },
      settings: { get: vi.fn(() => 'wsp_open') },
    } as unknown as DevBrain;

    expect(bootSnapshot(devBrain)).toMatchObject({
      devBrainAvailable: true,
      current: { id: 'wsp_open' },
      last: 'wsp_open',
      workspaces: page,
    });
    expect(devBrain.workspaces.listAll).toHaveBeenCalledWith();
  });

  it('uses the saved last workspace when none is open', () => {
    const devBrain = {
      currentWorkspace: null,
      workspaces: {
        listAll: vi.fn(() => ({ items: [], nextCursor: null })),
        getById: vi.fn(() => ({ id: 'wsp_last' })),
      },
      settings: { get: vi.fn(() => 'wsp_last') },
    } as unknown as DevBrain;

    expect(bootSnapshot(devBrain).last).toBe('wsp_last');
  });

  it('always answers the synchronous message, and can detach', () => {
    const stop = attachBoot(null);
    expect(sendSyncToMain('ipc:boot')).toMatchObject({ devBrainAvailable: false });

    stop();
    expect(ipcMain.removeListener).toHaveBeenCalledWith('ipc:boot', expect.any(Function));
    expect(() => sendSyncToMain('ipc:boot')).toThrow(/No listener/);
  });

  it('answers null when building the snapshot fails', () => {
    const devBrain = {
      currentWorkspace: null,
      workspaces: {
        listAll: vi.fn(() => {
          throw new Error('disk');
        }),
      },
      settings: { get: vi.fn(() => null) },
    } as unknown as DevBrain;
    attachBoot(devBrain);

    expect(sendSyncToMain('ipc:boot')).toBeNull();
  });
});
