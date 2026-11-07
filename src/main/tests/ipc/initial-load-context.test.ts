import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { DevBrain } from '@main/core';
import { ChangeTracker } from '@main/ipc/changes';
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
  const NONE = { version: 0, state: { status: 'none', error: null } };

  it('says DevBrain is unavailable when it did not load', () => {
    expect(initialLoadContext(null)).toEqual({
      devBrainAvailable: false,
      workspace: NONE,
      workspaces: { items: [], nextCursor: null },
      settings: null,
    });
  });

  it('has no workspace and the default settings in an empty folder', () => {
    expect(initialLoadContext(devBrain)).toEqual({
      devBrainAvailable: true,
      workspace: NONE,
      workspaces: { items: [], nextCursor: null },
      settings: devBrain.settings.get('settings'),
    });
  });

  it('carries the settings, so the page paints in its theme from the start', () => {
    devBrain.settings.set('settings.theme', 'dark');
    expect(initialLoadContext(devBrain).settings?.theme).toBe('dark');
  });

  it('carries the workspace state the tracker last sent, and the list', async () => {
    const work = await createWorkspace(devBrain, 'Work');
    await createWorkspace(devBrain, 'Home');
    const tracker = new ChangeTracker(vi.fn());
    tracker.watch(devBrain);
    await devBrain.workspaces.open(work);

    const context = initialLoadContext(devBrain, tracker.workspaceSnapshot());
    expect(context.workspace).toEqual({
      version: 2,
      state: { status: 'open', workspace: expect.objectContaining({ id: work }), error: null },
    });
    expect(context.workspaces.items.map(({ name }) => name)).toEqual(['Work', 'Home']);
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
