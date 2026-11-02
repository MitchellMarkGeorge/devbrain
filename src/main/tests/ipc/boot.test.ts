import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { DevBrain } from '@main/core';
import { attachBoot, bootSnapshot } from '@main/ipc/boot';
import { resetElectronMock, sendSyncToMain } from '../__mocks__/electron';
import { createWorkspace, tempDevBrain } from './helpers';

// What a page renders first, built over a real DevBrain folder.

let devBrain: DevBrain;
let cleanup: () => Promise<void>;

beforeEach(async () => {
  ({ devBrain, cleanup } = await tempDevBrain());
});

afterEach(async () => {
  resetElectronMock();
  await cleanup();
});

describe('bootSnapshot', () => {
  it('says DevBrain is unavailable when it did not load', () => {
    expect(bootSnapshot(null)).toEqual({
      devBrainAvailable: false,
      current: null,
      last: null,
      workspaces: { items: [], nextCursor: null },
    });
  });

  it('has nothing to open in an empty folder', () => {
    expect(bootSnapshot(devBrain)).toEqual({
      devBrainAvailable: true,
      current: null,
      last: null,
      workspaces: { items: [], nextCursor: null },
    });
  });

  it('names the workspace openLast would open while none is open', async () => {
    const work = await createWorkspace(devBrain, 'Work');
    await createWorkspace(devBrain, 'Home');
    devBrain.settings.set('state.lastWorkspaceId', work);

    const snapshot = bootSnapshot(devBrain);
    expect(snapshot.current).toBeNull();
    expect(snapshot.last).toMatchObject({ id: work, name: 'Work' });
    expect(snapshot.workspaces.items.map(({ name }) => name)).toEqual(['Work', 'Home']);
  });

  it('has the open workspace, and no last one to open, once one is open', async () => {
    const work = await createWorkspace(devBrain, 'Work');
    devBrain.settings.set('state.lastWorkspaceId', work);
    await devBrain.workspaces.open(work);

    expect(bootSnapshot(devBrain)).toMatchObject({ current: { id: work }, last: null });
  });
});

describe('attachBoot', () => {
  it('answers the boot message with a fresh snapshot each time', () => {
    let n = 0;
    attachBoot(() => ({ n: ++n }) as never, vi.fn());

    expect(sendSyncToMain('ipc:boot')).toEqual({ n: 1 });
    expect(sendSyncToMain('ipc:boot')).toEqual({ n: 2 });
  });

  it('answers null when the snapshot throws, reporting the error', () => {
    const onError = vi.fn();
    const error = new Error('unreadable registry');
    attachBoot(() => {
      throw error;
    }, onError);

    expect(sendSyncToMain('ipc:boot')).toBeNull();
    expect(onError).toHaveBeenCalledWith(error);
  });

  it('stops answering once detached', () => {
    const detach = attachBoot(() => ({}) as never, vi.fn());
    detach();
    expect(() => sendSyncToMain('ipc:boot')).toThrow('No listener');
  });
});
