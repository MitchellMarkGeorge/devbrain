import { describe, it, expect, vi, beforeAll, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import type { WorkspaceId } from '@common/ids';
import { MIGRATIONS_PATH } from '@main/core/tests/utils';

vi.mock('electron-store', () => import('@main/core/tests/__mocks__/electron-store'));

import { DevBrain, openDevBrain } from '@main/core';
import { pickWorkspace, startDevBrain } from '../../runtime/start';

// Which DevBrain folder and workspace the app opens at start. electron-store is mocked, so
// settings live in memory: each test builds the folder and starts DevBrain on it within the test.

let tmpDir: string;
let rootPath: string;
let started: DevBrain | null = null;

function quietLogger() {
  return { info: vi.fn(), warn: vi.fn() };
}

// a DevBrain folder with these workspaces, created in order and closed
async function folderWith(...names: string[]): Promise<{ devBrain: DevBrain; ids: WorkspaceId[] }> {
  const devBrain = await openDevBrain({ path: rootPath, createIfMissing: true });
  const ids: WorkspaceId[] = [];
  for (const name of names) {
    const workspace = await devBrain.workspaces.create({ name, color: '#000000' });
    await workspace.close();
    ids.push(workspace.info.id);
    // createdAt orders the workspaces; keep them apart
    await new Promise((resolve) => setTimeout(resolve, 2));
  }
  return { devBrain, ids };
}

beforeAll(() => {
  process.env.DB_MIGRATIONS_PATH = MIGRATIONS_PATH;
});

beforeEach(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'devbrain-start-'));
  rootPath = path.join(tmpDir, 'brain');
});

afterEach(async () => {
  await started?.close();
  started = null;
  await fs.rm(tmpDir, { recursive: true, force: true });
});

describe('startDevBrain — the folder', () => {
  it('returns null and says how to make one when there is none to load', async () => {
    const logger = quietLogger();
    started = await startDevBrain({ rootPath, createIfMissing: false, workspace: {}, logger });
    expect(started).toBeNull();
    expect(logger.warn).toHaveBeenCalledWith(expect.stringContaining('npm run seed:dev'));
    await expect(fs.stat(rootPath)).rejects.toThrow();
  });

  it('creates an empty one on first run when asked to, opening nothing', async () => {
    started = await startDevBrain({
      rootPath,
      createIfMissing: true,
      workspace: {},
      logger: quietLogger(),
    });
    expect(started).not.toBeNull();
    expect(started!.currentWorkspace).toBeNull();
    expect((await fs.stat(path.join(rootPath, 'workspaces.json'))).isFile()).toBe(true);
  });

  it('creates one in an empty directory', async () => {
    await fs.mkdir(rootPath);
    started = await startDevBrain({
      rootPath,
      createIfMissing: true,
      workspace: {},
      logger: quietLogger(),
    });
    expect(started!.workspaces.listAll().items).toEqual([]);
  });

  it('throws for a folder that is not a DevBrain folder, changing nothing', async () => {
    await fs.mkdir(rootPath);
    await fs.writeFile(path.join(rootPath, 'notes.txt'), 'mine');
    await expect(
      startDevBrain({ rootPath, createIfMissing: true, workspace: {}, logger: quietLogger() }),
    ).rejects.toThrow('settings.json');
    expect(await fs.readdir(rootPath)).toEqual(['notes.txt']);
  });
});

describe('startDevBrain — the workspace', () => {
  it('opens the named workspace, starts syncing it and remembers it', async () => {
    const { ids } = await folderWith('Other', 'Dev');
    started = await startDevBrain({
      rootPath,
      createIfMissing: false,
      preferredWorkspaceName: 'Dev',
      workspace: {},
      logger: quietLogger(),
    });
    expect(started!.currentWorkspace?.info.id).toBe(ids[1]);
    expect(await started!.currentWorkspace!.sync.getStatus()).toEqual([]);
    expect(started!.settings.get('state.lastWorkspaceId')).toBe(ids[1]);
  });

  it('logs a workspace that fails to open and leaves none open', async () => {
    const { devBrain, ids } = await folderWith('Dev');
    await fs.rm(devBrain.workspaces.getById(ids[0]).path, { recursive: true });
    const logger = quietLogger();
    started = await startDevBrain({ rootPath, createIfMissing: false, workspace: {}, logger });
    expect(started!.currentWorkspace).toBeNull();
    expect(logger.warn).toHaveBeenCalledWith(`Opening workspace ${ids[0]} failed error=Error`);
  });
});

describe('pickWorkspace', () => {
  it('picks the last workspace opened, while it is still registered', async () => {
    const { devBrain, ids } = await folderWith('Dev', 'Last');
    devBrain.settings.set('state.lastWorkspaceId', ids[1]);
    expect(pickWorkspace(devBrain, 'Dev')).toBe(ids[1]);

    devBrain.settings.set('state.lastWorkspaceId', 'wsp_gone');
    expect(pickWorkspace(devBrain, 'Dev')).toBe(ids[0]);
  });

  it('else the named one, else the oldest, else none', async () => {
    const { devBrain, ids } = await folderWith('First', 'Dev');
    expect(pickWorkspace(devBrain, 'Dev')).toBe(ids[1]);
    expect(pickWorkspace(devBrain, 'Missing')).toBe(ids[0]);
    expect(pickWorkspace(devBrain)).toBe(ids[0]);

    const empty = await openDevBrain({ path: path.join(tmpDir, 'empty'), createIfMissing: true });
    expect(pickWorkspace(empty)).toBeNull();
  });
});
