import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { DevBrain } from '@main/core';
import { attachInitialLoadContext, initialLoadContext } from '@main/ipc/initial-load-context';
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

describe('initialLoadContext', () => {
  it('says DevBrain is unavailable when it did not load', () => {
    expect(initialLoadContext(null)).toEqual({
      devBrainAvailable: false,
      current: null,
      last: null,
      workspaces: { items: [], nextCursor: null },
      settings: null,
    });
  });

  it('has nothing to open in an empty folder', () => {
    expect(initialLoadContext(devBrain)).toEqual({
      devBrainAvailable: true,
      current: null,
      last: null,
      workspaces: { items: [], nextCursor: null },
      settings: devBrain.settings.get('settings'),
    });
  });

  it('carries the settings as they are now: the theme, so the page paints in it from the start', () => {
    devBrain.settings.set('settings.theme', 'dark');
    devBrain.settings.set('settings.general.openToLastPage', true);
    expect(initialLoadContext(devBrain).settings).toMatchObject({
      theme: 'dark',
      general: { openToLastPage: true },
    });
  });

  it('names the workspace openLast would open while none is open', async () => {
    const work = await createWorkspace(devBrain, 'Work');
    await createWorkspace(devBrain, 'Home');
    devBrain.settings.set('state.lastWorkspaceId', work);

    const context = initialLoadContext(devBrain);
    expect(context.current).toBeNull();
    expect(context.last).toMatchObject({ id: work, name: 'Work' });
    expect(context.workspaces.items.map(({ name }) => name)).toEqual(['Work', 'Home']);
  });

  it('has the open workspace, and no last one to open, once one is open', async () => {
    const work = await createWorkspace(devBrain, 'Work');
    devBrain.settings.set('state.lastWorkspaceId', work);
    await devBrain.workspaces.open(work);

    expect(initialLoadContext(devBrain)).toMatchObject({ current: { id: work }, last: null });
  });
});

describe('attachInitialLoadContext', () => {
  it('answers the initial load context message with a fresh context each time', () => {
    let n = 0;
    attachInitialLoadContext(() => ({ n: ++n }) as never, vi.fn());

    expect(sendSyncToMain('ipc:initial-load-context')).toEqual({ n: 1 });
    expect(sendSyncToMain('ipc:initial-load-context')).toEqual({ n: 2 });
  });

  it('answers null when building the context throws, reporting the error', () => {
    const onError = vi.fn();
    const error = new Error('unreadable registry');
    attachInitialLoadContext(() => {
      throw error;
    }, onError);

    expect(sendSyncToMain('ipc:initial-load-context')).toBeNull();
    expect(onError).toHaveBeenCalledWith(error);
  });

  it('stops answering once detached', () => {
    const detach = attachInitialLoadContext(() => ({}) as never, vi.fn());
    detach();
    expect(() => sendSyncToMain('ipc:initial-load-context')).toThrow('No listener');
  });
});
