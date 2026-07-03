import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { scaffoldDevBrain } from '../../local/scaffold';
import { fileExists, directoryExists } from '../../local/utils';
import { settingsFileSchema } from '../../settings/schema';
import { workspaceRegistrySchema } from '../../workspace/schema';

let dir: string;

beforeEach(async () => {
  dir = await fs.mkdtemp(path.join(os.tmpdir(), 'devbrain-scaffold-'));
  // Use a subdirectory so scaffold controls creation
  dir = path.join(dir, 'root');
});

afterEach(async () => {
  await fs.rm(path.dirname(dir), { recursive: true });
});

describe('scaffoldDevBrain', () => {
  describe('directory creation', () => {
    it('creates the root directory', async () => {
      await scaffoldDevBrain(dir, false);
      expect(await directoryExists(dir)).toBe(true);
    });

    it('creates parent directories if they do not exist', async () => {
      const deepDir = path.join(dir, 'a', 'b', 'c');
      await scaffoldDevBrain(deepDir, false);
      expect(await directoryExists(deepDir)).toBe(true);
    });
  });

  describe('file creation', () => {
    it('creates settings.json', async () => {
      await scaffoldDevBrain(dir, false);
      expect(await fileExists(path.join(dir, 'settings.json'))).toBe(true);
    });

    it('creates workspaces.json', async () => {
      await scaffoldDevBrain(dir, false);
      expect(await fileExists(path.join(dir, 'workspaces.json'))).toBe(true);
    });

    it('creates only settings.json and workspaces.json at the root', async () => {
      await scaffoldDevBrain(dir, false);
      const entries = await fs.readdir(dir);
      expect(entries.sort()).toEqual(['settings.json', 'workspaces.json']);
    });
  });

  describe('settings.json content', () => {
    it('writes valid JSON to settings.json', async () => {
      await scaffoldDevBrain(dir, false);
      const raw = await fs.readFile(path.join(dir, 'settings.json'), 'utf8');
      expect(() => JSON.parse(raw)).not.toThrow();
    });

    it('writes a settings file that passes settingsFileSchema validation', async () => {
      await scaffoldDevBrain(dir, false);
      const raw = await fs.readFile(path.join(dir, 'settings.json'), 'utf8');
      const parsed = JSON.parse(raw);
      expect(settingsFileSchema.safeParse(parsed).success).toBe(true);
    });

    it('settings.json includes a state object with null values', async () => {
      await scaffoldDevBrain(dir, false);
      const raw = await fs.readFile(path.join(dir, 'settings.json'), 'utf8');
      const parsed = JSON.parse(raw);
      expect(parsed.state.lastPage).toBeNull();
      expect(parsed.state.lastWorkspaceId).toBeNull();
    });
  });

  describe('workspaces.json content', () => {
    it('writes valid JSON to workspaces.json', async () => {
      await scaffoldDevBrain(dir, false);
      const raw = await fs.readFile(path.join(dir, 'workspaces.json'), 'utf8');
      expect(() => JSON.parse(raw)).not.toThrow();
    });

    it('writes an empty registry to workspaces.json', async () => {
      await scaffoldDevBrain(dir, false);
      const raw = await fs.readFile(path.join(dir, 'workspaces.json'), 'utf8');
      expect(JSON.parse(raw)).toEqual({});
    });

    it('workspaces.json passes workspaceRegistrySchema validation', async () => {
      await scaffoldDevBrain(dir, false);
      const raw = await fs.readFile(path.join(dir, 'workspaces.json'), 'utf8');
      const parsed = JSON.parse(raw);
      expect(workspaceRegistrySchema.safeParse(parsed).success).toBe(true);
    });
  });

  describe('overwrite behaviour', () => {
    it('throws when directory exists and overwrite is false', async () => {
      await fs.mkdir(dir, { recursive: true });
      await expect(scaffoldDevBrain(dir, false)).rejects.toThrow(/already exists/);
    });

    it('does not throw when directory exists and overwrite is true', async () => {
      await scaffoldDevBrain(dir, false);
      await expect(scaffoldDevBrain(dir, true)).resolves.toBeUndefined();
    });

    it('overwrites existing directory when overwrite is true', async () => {
      await scaffoldDevBrain(dir, false);
      // Write a sentinel file that should be erased on overwrite
      await fs.writeFile(path.join(dir, 'sentinel.txt'), 'old');
      await scaffoldDevBrain(dir, true);
      expect(await fileExists(path.join(dir, 'sentinel.txt'))).toBe(false);
      expect(await fileExists(path.join(dir, 'settings.json'))).toBe(true);
    });

    it('fresh scaffold after overwrite still produces a valid settings file', async () => {
      await scaffoldDevBrain(dir, false);
      // Corrupt the settings file
      await fs.writeFile(path.join(dir, 'settings.json'), 'corrupted');
      await scaffoldDevBrain(dir, true);
      const raw = await fs.readFile(path.join(dir, 'settings.json'), 'utf8');
      expect(settingsFileSchema.safeParse(JSON.parse(raw)).success).toBe(true);
    });
  });
});
