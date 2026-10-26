import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { devBrainFolderState, validateDevBrainFolderStructure } from '../../local/validate';
import { TaskPriority } from '../../tasks/types';
import type { WorkspaceId } from '@common/ids';

// A minimal valid settings file — avoids depending on env-var-derived DEFAULTS
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

// A minimal valid workspace entry for registry tests
const VALID_WORKSPACE_ENTRY = {
  id: 'wsp_test001' as WorkspaceId,
  name: 'Test',
  color: '#000000',
  path: '/fake/workspaces/wsp_test001',
  createdAt: Date.now(),
  lastOpenedAt: null,
};

let tmpDir: string;
let rootPath: string;

const writeValidStructure = async (dir: string) => {
  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(path.join(dir, 'settings.json'), JSON.stringify(VALID_SETTINGS), 'utf8');
  await fs.writeFile(path.join(dir, 'workspaces.json'), JSON.stringify({}), 'utf8');
};

beforeEach(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'devbrain-validate-'));
  rootPath = path.join(tmpDir, 'root');
  await writeValidStructure(rootPath);
});

afterEach(async () => {
  await fs.rm(tmpDir, { recursive: true });
});

describe('validateDevBrainFolderStructure', () => {
  describe('valid structures', () => {
    it('returns valid for a correctly scaffolded directory', async () => {
      const result = await validateDevBrainFolderStructure(rootPath);
      expect(result.valid).toBe(true);
    });

    it('returns valid when workspaces.json contains workspace entries', async () => {
      const registry = { [VALID_WORKSPACE_ENTRY.id]: VALID_WORKSPACE_ENTRY };
      await fs.writeFile(path.join(rootPath, 'workspaces.json'), JSON.stringify(registry), 'utf8');
      const result = await validateDevBrainFolderStructure(rootPath);
      expect(result.valid).toBe(true);
    });

    it('returns valid when workspaces.json has multiple entries', async () => {
      const second = { ...VALID_WORKSPACE_ENTRY, id: 'wsp_test002' as WorkspaceId, name: 'Two' };
      const registry = {
        [VALID_WORKSPACE_ENTRY.id]: VALID_WORKSPACE_ENTRY,
        [second.id]: second,
      };
      await fs.writeFile(path.join(rootPath, 'workspaces.json'), JSON.stringify(registry), 'utf8');
      const result = await validateDevBrainFolderStructure(rootPath);
      expect(result.valid).toBe(true);
    });
  });

  describe('path validation', () => {
    it('rejects a relative path', async () => {
      const result = await validateDevBrainFolderStructure('relative/path');
      expect(result).toMatchObject({ valid: false, error: expect.stringContaining('absolute') });
    });

    it('rejects an empty string path', async () => {
      const result = await validateDevBrainFolderStructure('');
      expect(result.valid).toBe(false);
    });

    it('rejects a path that does not exist', async () => {
      const result = await validateDevBrainFolderStructure(path.join(tmpDir, 'nonexistent'));
      expect(result).toMatchObject({
        valid: false,
        error: expect.stringContaining('does not exist'),
      });
    });

    it('rejects when the path is a file, not a directory', async () => {
      const filePath = path.join(tmpDir, 'notadir.txt');
      await fs.writeFile(filePath, '');
      const result = await validateDevBrainFolderStructure(filePath);
      expect(result).toMatchObject({ valid: false, error: expect.stringContaining('directory') });
    });
  });

  describe('settings.json validation', () => {
    it('rejects when settings.json is missing', async () => {
      await fs.rm(path.join(rootPath, 'settings.json'));
      const result = await validateDevBrainFolderStructure(rootPath);
      expect(result).toMatchObject({
        valid: false,
        error: expect.stringContaining('settings.json'),
      });
    });

    it('rejects when settings.json is invalid JSON', async () => {
      await fs.writeFile(path.join(rootPath, 'settings.json'), 'not json');
      const result = await validateDevBrainFolderStructure(rootPath);
      expect(result).toMatchObject({ valid: false });
    });

    it('rejects when settings.json is valid JSON but fails schema (empty object)', async () => {
      await fs.writeFile(path.join(rootPath, 'settings.json'), JSON.stringify({}));
      const result = await validateDevBrainFolderStructure(rootPath);
      expect(result).toMatchObject({ valid: false });
    });

    it('rejects when settings.json has missing required fields', async () => {
      const partial = { settings: { theme: 'dark' }, state: {} };
      await fs.writeFile(path.join(rootPath, 'settings.json'), JSON.stringify(partial));
      const result = await validateDevBrainFolderStructure(rootPath);
      expect(result).toMatchObject({ valid: false });
    });
  });

  describe('workspaces.json validation', () => {
    it('rejects when workspaces.json is missing', async () => {
      await fs.rm(path.join(rootPath, 'workspaces.json'));
      const result = await validateDevBrainFolderStructure(rootPath);
      expect(result).toMatchObject({
        valid: false,
        error: expect.stringContaining('workspaces.json'),
      });
    });

    it('rejects a missing workspaces.json with no backup and no workspaces directory', async () => {
      await fs.writeFile(path.join(rootPath, 'workspaces.json.bak'), 'not json');
      await fs.rm(path.join(rootPath, 'workspaces.json'));
      expect(await validateDevBrainFolderStructure(rootPath)).toMatchObject({ valid: false });
    });

    it('accepts a missing workspaces.json with a valid backup, which DevBrain.open restores', async () => {
      await fs.rename(
        path.join(rootPath, 'workspaces.json'),
        path.join(rootPath, 'workspaces.json.bak'),
      );
      expect(await validateDevBrainFolderStructure(rootPath)).toEqual({ valid: true });
    });

    it('accepts a missing workspaces.json beside a workspaces directory to rebuild it from', async () => {
      await fs.rm(path.join(rootPath, 'workspaces.json'));
      await fs.mkdir(path.join(rootPath, 'workspaces'));
      expect(await validateDevBrainFolderStructure(rootPath)).toEqual({ valid: true });
    });

    // an invalid registry stood for workspaces that all have a directory, so it can be rebuilt
    it.each([
      ['invalid JSON', 'not json'],
      ['keys without the wsp_ prefix', JSON.stringify({ bad_key: VALID_WORKSPACE_ENTRY })],
      [
        'an invalid workspace entry',
        JSON.stringify({ wsp_test001: { id: 'wsp_test001', name: 'Incomplete' } }),
      ],
    ])('accepts a workspaces.json with %s, which DevBrain.open restores', async (_, content) => {
      await fs.writeFile(path.join(rootPath, 'workspaces.json'), content);
      expect(await validateDevBrainFolderStructure(rootPath)).toEqual({ valid: true });
    });
  });
});

describe('devBrainFolderState', () => {
  // beside the valid folder every test starts with
  let folder: string;
  beforeEach(() => {
    folder = path.join(tmpDir, 'other');
  });

  it('is missing when nothing is at the path', async () => {
    expect(await devBrainFolderState(folder)).toBe('missing');
  });

  it('is empty for a directory with nothing in it, or junk files only', async () => {
    await fs.mkdir(folder);
    expect(await devBrainFolderState(folder)).toBe('empty');
    await fs.writeFile(path.join(folder, '.DS_Store'), '');
    expect(await devBrainFolderState(folder)).toBe('empty');
  });

  it('is present for a directory holding anything else', async () => {
    await fs.mkdir(folder);
    await fs.writeFile(path.join(folder, 'notes.txt'), 'mine');
    expect(await devBrainFolderState(folder)).toBe('present');
  });

  it('is present for a file, which validation then refuses', async () => {
    await fs.writeFile(folder, 'content');
    expect(await devBrainFolderState(folder)).toBe('present');
  });
});
