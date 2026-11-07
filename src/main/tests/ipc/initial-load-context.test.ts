import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { InitialLoadContext } from '@common/ipc/types';
import type { DevBrain } from '@main/core';
import fs from 'node:fs/promises';
import { attachInitialLoadContext, initialLoadContext } from '@main/ipc/initial-load-context';
import { reopenLastWorkspace } from '@main/runtime/start';
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
      opening: null,
      openFailure: null,
      workspaces: { items: [], nextCursor: null },
      settings: null,
    });
  });

  it('has nothing to open in an empty folder', () => {
    expect(initialLoadContext(devBrain)).toEqual({
      devBrainAvailable: true,
      current: null,
      opening: null,
      openFailure: null,
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

  it('names the workspace opening, while main reopens it', async () => {
    const work = await createWorkspace(devBrain, 'Work');
    await createWorkspace(devBrain, 'Home');
    devBrain.settings.set('state.lastWorkspaceId', work);

    // a page loading while the open runs
    let context: InitialLoadContext | null = null;
    devBrain.workspaces.onChange((change) => {
      if (change.type === 'opening') context = initialLoadContext(devBrain, opened);
    });
    const opened = reopenLastWorkspace(devBrain, vi.fn());
    await vi.waitFor(() => expect(devBrain.currentWorkspace?.info.id).toBe(work));

    expect(context).toMatchObject({ current: null, opening: { id: work, name: 'Work' } });
    expect(context!.workspaces.items.map(({ name }) => name)).toEqual(['Work', 'Home']);
  });

  it('has the open workspace, and none opening, once one is open', async () => {
    const work = await createWorkspace(devBrain, 'Work');
    await devBrain.workspaces.open(work);

    expect(initialLoadContext(devBrain)).toMatchObject({ current: { id: work }, opening: null });
  });

  it("says why main's startup open failed, on the first page load only", async () => {
    const gone = await createWorkspace(devBrain, 'Gone');
    devBrain.settings.set('state.lastWorkspaceId', gone);
    await fs.rm(devBrain.workspaces.getById(gone).path, { recursive: true });
    const onError = vi.fn();
    const opened = reopenLastWorkspace(devBrain, onError);
    await vi.waitFor(() => expect(onError).toHaveBeenCalledOnce());

    expect(initialLoadContext(devBrain, opened)).toMatchObject({
      current: null,
      opening: null,
      openFailure: { code: 'workspace_data_missing' },
    });
    // a reload
    expect(initialLoadContext(devBrain, opened).openFailure).toBeNull();
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
