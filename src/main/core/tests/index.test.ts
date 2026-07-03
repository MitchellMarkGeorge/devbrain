import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { TaskPriority } from '../tasks/types';

vi.mock('electron-store', () => import('./__mocks__/electron-store'));

import { loadDevBrain, initDevBrain, DevBrain } from '../index';

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
      timezone: 'America/Toronto',
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

describe('loadDevBrain', () => {
  describe('valid paths', () => {
    it('returns a DevBrain instance for a valid path', async () => {
      await writeValidStructure(tmpDir);
      const brain = await loadDevBrain({ path: tmpDir });
      expect(brain).toBeInstanceOf(DevBrain);
    });

    it('returned instance exposes a settings service', async () => {
      await writeValidStructure(tmpDir);
      const brain = await loadDevBrain({ path: tmpDir });
      expect(brain.settings).toBeDefined();
    });

    it('returned instance exposes a workspaces service', async () => {
      await writeValidStructure(tmpDir);
      const brain = await loadDevBrain({ path: tmpDir });
      expect(brain.workspaces).toBeDefined();
    });

    it('currentWorkspace is null before any workspace is opened', async () => {
      await writeValidStructure(tmpDir);
      const brain = await loadDevBrain({ path: tmpDir });
      expect(brain.currentWorkspace).toBeNull();
    });

    it('settings.get() returns the correct value from the written file', async () => {
      await writeValidStructure(tmpDir);
      const brain = await loadDevBrain({ path: tmpDir });
      expect(brain.settings.get('settings.theme')).toBe('dark');
    });

    it('workspaces.listAll() returns an empty array for an empty registry', async () => {
      await writeValidStructure(tmpDir);
      const brain = await loadDevBrain({ path: tmpDir });
      expect(brain.workspaces.listAll()).toEqual([]);
    });
  });

  describe('invalid paths', () => {
    it('throws for a path that does not exist', async () => {
      await expect(loadDevBrain({ path: path.join(tmpDir, 'missing') })).rejects.toThrow();
    });

    it('throws when the path is a file, not a directory', async () => {
      const filePath = path.join(tmpDir, 'afile.txt');
      await fs.writeFile(filePath, 'content');
      await expect(loadDevBrain({ path: filePath })).rejects.toThrow();
    });

    it('throws when the path is not absolute', async () => {
      await expect(loadDevBrain({ path: 'relative/path' })).rejects.toThrow();
    });

    it('throws for a path missing settings.json', async () => {
      await fs.mkdir(tmpDir, { recursive: true });
      await fs.writeFile(path.join(tmpDir, 'workspaces.json'), '{}', 'utf8');
      await expect(loadDevBrain({ path: tmpDir })).rejects.toThrow();
    });

    it('throws for a path missing workspaces.json', async () => {
      await fs.mkdir(tmpDir, { recursive: true });
      await fs.writeFile(
        path.join(tmpDir, 'settings.json'),
        JSON.stringify(VALID_SETTINGS),
        'utf8',
      );
      await expect(loadDevBrain({ path: tmpDir })).rejects.toThrow();
    });

    it('throws when settings.json is invalid JSON', async () => {
      await fs.mkdir(tmpDir, { recursive: true });
      await fs.writeFile(path.join(tmpDir, 'settings.json'), 'not json', 'utf8');
      await fs.writeFile(path.join(tmpDir, 'workspaces.json'), '{}', 'utf8');
      await expect(loadDevBrain({ path: tmpDir })).rejects.toThrow();
    });

    it('throws when settings.json is valid JSON but fails schema', async () => {
      await fs.mkdir(tmpDir, { recursive: true });
      await fs.writeFile(
        path.join(tmpDir, 'settings.json'),
        JSON.stringify({ invalid: true }),
        'utf8',
      );
      await fs.writeFile(path.join(tmpDir, 'workspaces.json'), '{}', 'utf8');
      await expect(loadDevBrain({ path: tmpDir })).rejects.toThrow();
    });

    it('throws when workspaces.json is invalid JSON', async () => {
      await fs.mkdir(tmpDir, { recursive: true });
      await fs.writeFile(
        path.join(tmpDir, 'settings.json'),
        JSON.stringify(VALID_SETTINGS),
        'utf8',
      );
      await fs.writeFile(path.join(tmpDir, 'workspaces.json'), 'not json', 'utf8');
      await expect(loadDevBrain({ path: tmpDir })).rejects.toThrow();
    });
  });
});

describe('initDevBrain', () => {
  describe('successful initialisation', () => {
    it('returns a DevBrain instance', async () => {
      const initPath = path.join(tmpDir, 'new');
      const brain = await initDevBrain({ path: initPath });
      expect(brain).toBeInstanceOf(DevBrain);
    });

    it('returned instance exposes a settings service', async () => {
      const initPath = path.join(tmpDir, 'new');
      const brain = await initDevBrain({ path: initPath });
      expect(brain.settings).toBeDefined();
    });

    it('returned instance exposes a workspaces service', async () => {
      const initPath = path.join(tmpDir, 'new');
      const brain = await initDevBrain({ path: initPath });
      expect(brain.workspaces).toBeDefined();
    });

    it('currentWorkspace is null on a freshly initialised DevBrain', async () => {
      const initPath = path.join(tmpDir, 'new');
      const brain = await initDevBrain({ path: initPath });
      expect(brain.currentWorkspace).toBeNull();
    });

    it('creates settings.json at the given path', async () => {
      const initPath = path.join(tmpDir, 'new');
      await initDevBrain({ path: initPath });
      await expect(fs.stat(path.join(initPath, 'settings.json'))).resolves.toBeDefined();
    });

    it('creates workspaces.json at the given path', async () => {
      const initPath = path.join(tmpDir, 'new');
      await initDevBrain({ path: initPath });
      await expect(fs.stat(path.join(initPath, 'workspaces.json'))).resolves.toBeDefined();
    });

    it('the initialised path can subsequently be loaded with loadDevBrain', async () => {
      const initPath = path.join(tmpDir, 'new');
      await initDevBrain({ path: initPath });
      await expect(loadDevBrain({ path: initPath })).resolves.toBeInstanceOf(DevBrain);
    });
  });

  describe('overwrite behaviour', () => {
    it('throws when path exists and overwrite is false', async () => {
      const initPath = path.join(tmpDir, 'existing');
      await fs.mkdir(initPath);
      await expect(initDevBrain({ path: initPath, overwrite: false })).rejects.toThrow(
        /already exists/,
      );
    });

    it('throws when path exists and overwrite is not provided (defaults to false)', async () => {
      const initPath = path.join(tmpDir, 'existing');
      await fs.mkdir(initPath);
      await expect(initDevBrain({ path: initPath })).rejects.toThrow(/already exists/);
    });

    it('succeeds when overwrite is true and path exists', async () => {
      const initPath = path.join(tmpDir, 'existing');
      await initDevBrain({ path: initPath });
      await expect(initDevBrain({ path: initPath, overwrite: true })).resolves.toBeInstanceOf(
        DevBrain,
      );
    });

    it('discards old content when overwriting', async () => {
      const initPath = path.join(tmpDir, 'existing');
      await initDevBrain({ path: initPath });
      await fs.writeFile(path.join(initPath, 'sentinel.txt'), 'old');
      await initDevBrain({ path: initPath, overwrite: true });
      await expect(fs.stat(path.join(initPath, 'sentinel.txt'))).rejects.toThrow();
    });
  });
});
