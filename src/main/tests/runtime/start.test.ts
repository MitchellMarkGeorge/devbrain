import { EventEmitter } from 'node:events';
import { Workspace } from '@main/core/workspace/workspace';
import { deferred } from '@main/core/tests/utils';
import { closeBeforeQuit } from '../../runtime/lifecycle';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import type { WorkspaceId } from '@common/ids';
import { WORKSPACE_OPTIONS } from '@main/core/tests/utils';
import { openFileSettingsStore } from './__mocks__/file-store';
import { DevBrain, openDevBrain } from '@main/core';
import { lastOpenedWorkspace, loadDevBrain, openLastWorkspace } from '../../runtime/start';

// Which DevBrain folder and workspace the app opens at start. Settings are kept in the folder's
// settings.json, as electron-store keeps them, so a setting one DevBrain writes is read at the next
// start.

let tmpDir: string;
let rootPath: string;
let started: DevBrain | null = null;

function quietLogger() {
  return { info: vi.fn(), warn: vi.fn() };
}

// a DevBrain folder with these workspaces, created in order and closed
async function folderWith(...names: string[]): Promise<{ devBrain: DevBrain; ids: WorkspaceId[] }> {
  const devBrain = await openDevBrain({
    settingsStore: openFileSettingsStore,
    path: rootPath,
    createIfMissing: true,
    workspace: WORKSPACE_OPTIONS,
  });
  const ids: WorkspaceId[] = [];
  for (const name of names) {
    const info = await devBrain.workspaces.create({ name, color: '#000000' });
    ids.push(info.id);
  }
  return { devBrain, ids };
}

beforeEach(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'devbrain-start-'));
  rootPath = path.join(tmpDir, 'brain');
});

afterEach(async () => {
  await started?.close();
  started = null;
  await fs.rm(tmpDir, { recursive: true, force: true });
});

describe('loadDevBrain', () => {
  it('returns null and says how to make one when there is none to load', async () => {
    const logger = quietLogger();
    started = await loadDevBrain({
      settingsStore: openFileSettingsStore,
      rootPath,
      createIfMissing: false,
      workspace: WORKSPACE_OPTIONS,
      logger,
    });
    expect(started).toBeNull();
    expect(logger.warn).toHaveBeenCalledWith(expect.stringContaining('npm run seed:dev'));
    await expect(fs.stat(rootPath)).rejects.toThrow();
  });

  it('creates an empty one on first run when asked to, opening nothing', async () => {
    started = await loadDevBrain({
      settingsStore: openFileSettingsStore,
      rootPath,
      createIfMissing: true,
      workspace: WORKSPACE_OPTIONS,
      logger: quietLogger(),
    });
    expect(started).not.toBeNull();
    expect(started!.currentWorkspace).toBeNull();
    expect((await fs.stat(path.join(rootPath, 'workspaces.json'))).isFile()).toBe(true);
  });

  it('creates one in an empty directory', async () => {
    await fs.mkdir(rootPath);
    started = await loadDevBrain({
      settingsStore: openFileSettingsStore,
      rootPath,
      createIfMissing: true,
      workspace: WORKSPACE_OPTIONS,
      logger: quietLogger(),
    });
    expect(started!.workspaces.listAll().items).toEqual([]);
  });

  it('opens no workspace, even the one open last time: openLastWorkspace does', async () => {
    const { devBrain, ids } = await folderWith('Last');
    devBrain.settings.set('state.lastWorkspaceId', ids[0]);
    started = await loadDevBrain({
      settingsStore: openFileSettingsStore,
      rootPath,
      createIfMissing: false,
      workspace: WORKSPACE_OPTIONS,
      logger: quietLogger(),
    });
    expect(started!.currentWorkspace).toBeNull();
  });

  it('throws for a folder that is not a DevBrain folder, changing nothing', async () => {
    await fs.mkdir(rootPath);
    await fs.writeFile(path.join(rootPath, 'notes.txt'), 'mine');
    await expect(
      loadDevBrain({
        settingsStore: openFileSettingsStore,
        rootPath,
        createIfMissing: true,
        workspace: WORKSPACE_OPTIONS,
        logger: quietLogger(),
      }),
    ).rejects.toThrow('settings.json');
    expect(await fs.readdir(rootPath)).toEqual(['notes.txt']);
  });
});

describe('openLastWorkspace', () => {
  it('reopens the workspace open last time, which starts syncing', async () => {
    const { devBrain, ids } = await folderWith('First', 'Last');
    devBrain.settings.set('state.lastWorkspaceId', ids[1]);
    started = await loadDevBrain({
      settingsStore: openFileSettingsStore,
      rootPath,
      createIfMissing: false,
      workspace: WORKSPACE_OPTIONS,
      logger: quietLogger(),
    });
    await openLastWorkspace(started!, quietLogger());
    expect(started!.currentWorkspace?.info.id).toBe(ids[1]);
    expect(started!.currentWorkspace!.sync.getStatus()).toEqual([]);
  });

  it('opens none when none was open last time, leaving the choice to the user', async () => {
    await folderWith('First', 'Second');
    const logger = quietLogger();
    started = await loadDevBrain({
      settingsStore: openFileSettingsStore,
      rootPath,
      createIfMissing: false,
      workspace: WORKSPACE_OPTIONS,
      logger: quietLogger(),
    });
    await openLastWorkspace(started!, logger);
    expect(started!.currentWorkspace).toBeNull();
    expect(logger.info).toHaveBeenCalledWith('No workspace was open last time; none opened');
  });

  it('opens none when the last workspace has been deleted since', async () => {
    const { devBrain } = await folderWith('First');
    devBrain.settings.set('state.lastWorkspaceId', 'wsp_gone');
    started = await loadDevBrain({
      settingsStore: openFileSettingsStore,
      rootPath,
      createIfMissing: false,
      workspace: WORKSPACE_OPTIONS,
      logger: quietLogger(),
    });
    await openLastWorkspace(started!, quietLogger());
    expect(started!.currentWorkspace).toBeNull();
  });

  it('logs a workspace that fails to open and leaves none open', async () => {
    const { devBrain, ids } = await folderWith('Dev');
    devBrain.settings.set('state.lastWorkspaceId', ids[0]);
    await fs.rm(devBrain.workspaces.getById(ids[0]).path, { recursive: true });
    const logger = quietLogger();
    started = await loadDevBrain({
      settingsStore: openFileSettingsStore,
      rootPath,
      createIfMissing: false,
      workspace: WORKSPACE_OPTIONS,
      logger: quietLogger(),
    });
    await openLastWorkspace(started!, logger);
    expect(started!.currentWorkspace).toBeNull();
    expect(logger.warn).toHaveBeenCalledWith(
      `Opening workspace ${ids[0]} failed error=WorkspaceDataMissingError`,
    );
  });
});

describe('lastOpenedWorkspace', () => {
  it('is the last workspace opened, while it is still registered', async () => {
    const { devBrain, ids } = await folderWith('First', 'Last');
    expect(lastOpenedWorkspace(devBrain)).toBeNull();

    devBrain.settings.set('state.lastWorkspaceId', ids[1]);
    expect(lastOpenedWorkspace(devBrain)).toBe(ids[1]);

    devBrain.settings.set('state.lastWorkspaceId', 'wsp_gone');
    expect(lastOpenedWorkspace(devBrain)).toBeNull();
  });
});

describe('startup shutdown', () => {
  it('holds quit during a pending workspace open and closes it before quitting', async () => {
    const { devBrain, ids } = await folderWith('Opening');
    devBrain.settings.set('state.lastWorkspaceId', ids[0]);
    const originalOpen = Workspace.open;
    const opening = deferred<Workspace>();
    const release = deferred<void>();
    const spy = vi.spyOn(Workspace, 'open').mockImplementationOnce(async (...args) => {
      const workspace = await originalOpen(...args);
      opening.resolve(workspace);
      await release.promise;
      return workspace;
    });
    try {
      // as src/main/index.ts starts: load DevBrain, hook quit to its close, then open
      const loaded = await loadDevBrain({
        settingsStore: openFileSettingsStore,
        rootPath,
        createIfMissing: false,
        workspace: WORKSPACE_OPTIONS,
        logger: quietLogger(),
      });
      started = loaded;
      const app = Object.assign(new EventEmitter(), { quit: vi.fn<() => void>() });
      closeBeforeQuit(app, () => loaded!.close(), quietLogger());
      const reopening = openLastWorkspace(loaded!, quietLogger());
      const workspace = await opening.promise;

      const event = { preventDefault: vi.fn() };
      app.emit('before-quit', event);
      app.emit('before-quit', event);
      expect(event.preventDefault).toHaveBeenCalledTimes(2);
      expect(app.quit).not.toHaveBeenCalled();

      // the close waits for the open to finish, then closes the workspace it opened
      release.resolve(undefined);
      await reopening;
      await vi.waitFor(() => expect(app.quit).toHaveBeenCalledOnce());
      expect(loaded!.currentWorkspace).toBeNull();
      expect(() => workspace.tasks.listTasks()).toThrow();
    } finally {
      release.resolve(undefined);
      spy.mockRestore();
    }
  });
});
