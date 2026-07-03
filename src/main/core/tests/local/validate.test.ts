import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { validateDevBrainFolderStructure } from '../../local/validate';
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
      timezone: 'America/Toronto',
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

    it('rejects when workspaces.json is invalid JSON', async () => {
      await fs.writeFile(path.join(rootPath, 'workspaces.json'), 'not json');
      const result = await validateDevBrainFolderStructure(rootPath);
      expect(result).toMatchObject({ valid: false });
    });

    it('rejects when workspaces.json has keys without wsp_ prefix', async () => {
      const badRegistry = { bad_key: VALID_WORKSPACE_ENTRY };
      await fs.writeFile(path.join(rootPath, 'workspaces.json'), JSON.stringify(badRegistry));
      const result = await validateDevBrainFolderStructure(rootPath);
      expect(result).toMatchObject({ valid: false });
    });

    it('rejects when workspaces.json has a wsp_ key but invalid workspace entry', async () => {
      const badRegistry = { wsp_test001: { id: 'wsp_test001', name: 'Incomplete' } };
      await fs.writeFile(path.join(rootPath, 'workspaces.json'), JSON.stringify(badRegistry));
      const result = await validateDevBrainFolderStructure(rootPath);
      expect(result).toMatchObject({ valid: false });
    });
  });
});
