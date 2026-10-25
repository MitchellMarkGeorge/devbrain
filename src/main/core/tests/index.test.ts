import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { TaskPriority } from '../tasks/types';
import { Provider } from '../integrations/types';
import { WORKSPACE_OPTIONS } from './utils';
import { FakeCipher } from './__mocks__/fake-cipher';
import { scriptedFetch } from './integrations/linear/fake-fetch';
import viewerFixture from './integrations/fixtures/linear/viewer.json';

import { openMemorySettingsStore } from './__mocks__/memory-settings-store';

import { openDevBrain, DevBrain } from '../index';

// Hardcoded valid settings — avoids depending on env-var-derived DEFAULTS
const VALID_SETTINGS = {
  settings: {
    theme: 'dark',
    devBrainPath: '/fake/path',
    general: {
      defaultLandingPage: 'home',
      launchOnStartup: false,
      openToLastPage: true,
      confirmBeforeDeleting: true,
      confirmBeforeArchiving: true,
      timeFormat: '12',
    },
    tasks: {
      defaultSort: 'priority',
      defaultPriority: TaskPriority.LOW,
      defaultDueDate: 'today',
      defaultView: 'list',
      showCompletedTasks: false,
    },
    calendar: {
      defaultEventDuration: '30m',
      firstDayOfWeek: 'monday',
      defaultView: 'week',
    },
  },
  state: { lastWorkspaceId: null, lastPage: null },
};

let tmpDir: string;

const writeValidStructure = async (dir: string) => {
  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(path.join(dir, 'settings.json'), JSON.stringify(VALID_SETTINGS), 'utf8');
  await fs.writeFile(path.join(dir, 'workspaces.json'), JSON.stringify({}), 'utf8');
};

beforeEach(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'devbrain-index-'));
});

afterEach(async () => {
  await fs.rm(tmpDir, { recursive: true });
});

describe('openDevBrain — an existing folder', () => {
  it('returns a DevBrain instance for a valid folder', async () => {
    await writeValidStructure(tmpDir);
    const brain = await openDevBrain({
      settingsStore: openMemorySettingsStore,
      path: tmpDir,
      workspace: WORKSPACE_OPTIONS,
    });
    expect(brain).toBeInstanceOf(DevBrain);
  });

  it('returned instance exposes a settings service', async () => {
    await writeValidStructure(tmpDir);
    const brain = await openDevBrain({
      settingsStore: openMemorySettingsStore,
      path: tmpDir,
      workspace: WORKSPACE_OPTIONS,
    });
    expect(brain.settings).toBeDefined();
  });

  it('returned instance exposes a workspaces service', async () => {
    await writeValidStructure(tmpDir);
    const brain = await openDevBrain({
      settingsStore: openMemorySettingsStore,
      path: tmpDir,
      workspace: WORKSPACE_OPTIONS,
    });
    expect(brain.workspaces).toBeDefined();
  });

  it('currentWorkspace is null before any workspace is opened', async () => {
    await writeValidStructure(tmpDir);
    const brain = await openDevBrain({
      settingsStore: openMemorySettingsStore,
      path: tmpDir,
      workspace: WORKSPACE_OPTIONS,
    });
    expect(brain.currentWorkspace).toBeNull();
  });

  it('settings.get() returns the correct value from the written file', async () => {
    await writeValidStructure(tmpDir);
    const brain = await openDevBrain({
      settingsStore: openMemorySettingsStore,
      path: tmpDir,
      workspace: WORKSPACE_OPTIONS,
    });
    expect(brain.settings.get('settings.theme')).toBe('dark');
  });

  it('workspaces.listAll().items returns an empty array for an empty registry', async () => {
    await writeValidStructure(tmpDir);
    const brain = await openDevBrain({
      settingsStore: openMemorySettingsStore,
      path: tmpDir,
      workspace: WORKSPACE_OPTIONS,
    });
    expect(brain.workspaces.listAll().items).toEqual([]);
  });

  it('opens a valid folder as it is with createIfMissing, keeping its contents', async () => {
    await writeValidStructure(tmpDir);
    await fs.writeFile(path.join(tmpDir, 'sentinel.txt'), 'kept');
    const settings = await fs.readFile(path.join(tmpDir, 'settings.json'), 'utf8');
    await expect(
      openDevBrain({
        settingsStore: openMemorySettingsStore,
        path: tmpDir,
        workspace: WORKSPACE_OPTIONS,
        createIfMissing: true,
      }),
    ).resolves.toBeInstanceOf(DevBrain);
    expect(await fs.readFile(path.join(tmpDir, 'settings.json'), 'utf8')).toBe(settings);
    expect(await fs.readFile(path.join(tmpDir, 'sentinel.txt'), 'utf8')).toBe('kept');
  });
});

describe('openDevBrain — no folder yet', () => {
  it('refuses a path that does not exist, creating nothing', async () => {
    const missing = path.join(tmpDir, 'missing');
    await expect(
      openDevBrain({
        settingsStore: openMemorySettingsStore,
        path: missing,
        workspace: WORKSPACE_OPTIONS,
      }),
    ).rejects.toMatchObject({
      code: 'devbrain_folder',
      reason: 'missing',
    });
    await expect(fs.stat(missing)).rejects.toThrow();
  });

  it('refuses an empty directory, leaving it empty', async () => {
    await expect(
      openDevBrain({
        settingsStore: openMemorySettingsStore,
        path: tmpDir,
        workspace: WORKSPACE_OPTIONS,
      }),
    ).rejects.toMatchObject({ reason: 'missing' });
    expect(await fs.readdir(tmpDir)).toEqual([]);
  });

  it('with createIfMissing, creates the folder with its settings and empty registry', async () => {
    const initPath = path.join(tmpDir, 'new', 'brain');
    const brain = await openDevBrain({
      settingsStore: openMemorySettingsStore,
      path: initPath,
      workspace: WORKSPACE_OPTIONS,
      createIfMissing: true,
    });
    expect(brain).toBeInstanceOf(DevBrain);
    expect(brain.currentWorkspace).toBeNull();
    expect(brain.workspaces.listAll().items).toEqual([]);
    await expect(fs.stat(path.join(initPath, 'settings.json'))).resolves.toBeDefined();
    await expect(fs.stat(path.join(initPath, 'workspaces.json'))).resolves.toBeDefined();
  });

  it('with createIfMissing, creates it in an empty directory, junk files aside', async () => {
    await fs.writeFile(path.join(tmpDir, '.DS_Store'), '');
    await openDevBrain({
      settingsStore: openMemorySettingsStore,
      path: tmpDir,
      workspace: WORKSPACE_OPTIONS,
      createIfMissing: true,
    });
    expect((await fs.readdir(tmpDir)).sort()).toEqual(
      ['.DS_Store', 'settings.json', 'workspaces.json'].sort(),
    );
  });

  it('a created folder opens again without createIfMissing', async () => {
    const initPath = path.join(tmpDir, 'new');
    await openDevBrain({
      settingsStore: openMemorySettingsStore,
      path: initPath,
      workspace: WORKSPACE_OPTIONS,
      createIfMissing: true,
    });
    await expect(
      openDevBrain({
        settingsStore: openMemorySettingsStore,
        path: initPath,
        workspace: WORKSPACE_OPTIONS,
      }),
    ).resolves.toBeInstanceOf(DevBrain);
  });
});

describe('openDevBrain — invalid folders', () => {
  // with or without createIfMissing: what is there is refused and left as it is
  describe.each([false, true])('createIfMissing: %s', (createIfMissing) => {
    const open = (folder: string) =>
      openDevBrain({
        settingsStore: openMemorySettingsStore,
        path: folder,
        workspace: WORKSPACE_OPTIONS,
        createIfMissing,
      });
    const invalid = { code: 'devbrain_folder', reason: 'invalid' };

    it('refuses a directory holding something else, changing nothing', async () => {
      await fs.writeFile(path.join(tmpDir, 'notes.txt'), 'mine');
      await expect(open(tmpDir)).rejects.toMatchObject(invalid);
      expect(await fs.readdir(tmpDir)).toEqual(['notes.txt']);
    });

    it('refuses a path that is a file', async () => {
      const filePath = path.join(tmpDir, 'afile.txt');
      await fs.writeFile(filePath, 'content');
      await expect(open(filePath)).rejects.toMatchObject(invalid);
      expect(await fs.readFile(filePath, 'utf8')).toBe('content');
    });

    it('refuses a path that is not absolute', async () => {
      await expect(open('relative/path')).rejects.toMatchObject(invalid);
    });

    it('refuses a folder missing settings.json', async () => {
      await fs.writeFile(path.join(tmpDir, 'workspaces.json'), '{}', 'utf8');
      await expect(open(tmpDir)).rejects.toMatchObject(invalid);
      expect(await fs.readdir(tmpDir)).toEqual(['workspaces.json']);
    });

    it('refuses a folder missing workspaces.json', async () => {
      await fs.writeFile(
        path.join(tmpDir, 'settings.json'),
        JSON.stringify(VALID_SETTINGS),
        'utf8',
      );
      await expect(open(tmpDir)).rejects.toMatchObject(invalid);
      expect(await fs.readdir(tmpDir)).toEqual(['settings.json']);
    });

    it('refuses settings.json that is not JSON', async () => {
      await fs.writeFile(path.join(tmpDir, 'settings.json'), 'not json', 'utf8');
      await fs.writeFile(path.join(tmpDir, 'workspaces.json'), '{}', 'utf8');
      await expect(open(tmpDir)).rejects.toMatchObject(invalid);
      expect(await fs.readFile(path.join(tmpDir, 'settings.json'), 'utf8')).toBe('not json');
    });

    it('refuses settings.json that fails the schema', async () => {
      await fs.writeFile(
        path.join(tmpDir, 'settings.json'),
        JSON.stringify({ invalid: true }),
        'utf8',
      );
      await fs.writeFile(path.join(tmpDir, 'workspaces.json'), '{}', 'utf8');
      await expect(open(tmpDir)).rejects.toMatchObject(invalid);
    });

    // with no backup and no workspace directories, the registry it stood for was empty
    it('restores workspaces.json that is not JSON, keeping a copy of it', async () => {
      await fs.writeFile(
        path.join(tmpDir, 'settings.json'),
        JSON.stringify(VALID_SETTINGS),
        'utf8',
      );
      await fs.writeFile(path.join(tmpDir, 'workspaces.json'), 'not json', 'utf8');
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
      const devBrain = await open(tmpDir);
      expect(warn).toHaveBeenCalledOnce();
      warn.mockRestore();
      expect(devBrain.workspaces.listAll().items).toEqual([]);
      const corrupt = (await fs.readdir(tmpDir)).filter((name) => name.includes('.corrupt-'));
      expect(corrupt).toHaveLength(1);
      expect(await fs.readFile(path.join(tmpDir, corrupt[0]), 'utf8')).toBe('not json');
      await devBrain.close();
    });
  });
});

describe('DevBrain — workspace options', () => {
  const API_KEY = 'lin_api_supersecretkey';

  it('reach every workspace it creates and opens, so a connection survives a restart', async () => {
    const initPath = path.join(tmpDir, 'brain');
    const cipher = new FakeCipher();
    const fetch = scriptedFetch([{ body: viewerFixture }]);

    const brain = await openDevBrain({
      settingsStore: openMemorySettingsStore,
      path: initPath,
      createIfMissing: true,
      workspace: { ...WORKSPACE_OPTIONS, cipher, fetch },
    });
    const created = await brain.workspaces.create({ name: 'Work', color: '#000000' });
    const connected = await created.integrations.connectWithApiKey(Provider.LINEAR, API_KEY);
    await created.close();

    const reloaded = await openDevBrain({
      settingsStore: openMemorySettingsStore,
      path: initPath,
      workspace: { ...WORKSPACE_OPTIONS, cipher },
    });
    const opened = await reloaded.workspaces.open(created.info.id);
    try {
      expect(opened.integrations.list()).toEqual([connected]);
    } finally {
      await opened.close();
    }
  });
});
