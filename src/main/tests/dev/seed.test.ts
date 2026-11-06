import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { openDevBrain } from '@main/core';
import { WORKSPACE_OPTIONS } from '@main/core/tests/utils';
import { openMemorySettingsStore } from '@main/core/tests/__mocks__/memory-settings-store';
import { DEFAULT_SEED, seedDevBrain } from '../../dev/seed';
import { runDevSeed } from '../../dev/run';
import type { SeedSwitches } from '../../runtime/dev-switches';

// The dev seed (src/main/dev), over a real DevBrain folder with no Linear key: what `--seed`
// builds, and how it treats a folder that is already there. Each seed takes about a second.

let tmpDir: string;
let rootPath: string;

beforeEach(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'devbrain-seed-'));
  rootPath = path.join(tmpDir, 'dev');
  // the seed prints its progress and summary
  vi.spyOn(console, 'log').mockImplementation(() => {});
  vi.spyOn(console, 'table').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(async () => {
  vi.restoreAllMocks();
  await fs.rm(tmpDir, { recursive: true, force: true });
});

const SWITCHES: SeedSwitches = { seed: null, reset: false, name: 'Seeded', quit: true };

function seed(switches: Partial<SeedSwitches> = {}) {
  return runDevSeed({
    rootPath,
    settingsStore: openMemorySettingsStore,
    workspace: WORKSPACE_OPTIONS,
    switches: { ...SWITCHES, ...switches },
  });
}

describe('seedDevBrain', () => {
  it(
    'fills a workspace, leaves it closed and records it as the last one open',
    { timeout: 30_000 },
    async () => {
      const devBrain = await openDevBrain({
        path: rootPath,
        settingsStore: openMemorySettingsStore,
        createIfMissing: true,
        workspace: WORKSPACE_OPTIONS,
      });
      try {
        const summary = await seedDevBrain(devBrain, {
          name: 'Seeded',
          seed: DEFAULT_SEED,
          linearApiKey: null,
        });

        // the same seed builds the same dataset
        expect(summary.counts).toEqual({
          projects: 14,
          events: 116,
          'tasks (top-level)': 217,
          'tasks (subtasks)': 165,
          'tasks (total)': 382,
          'notes (total)': 143,
        });
        expect(summary.linear).toContain('not connected');
        expect(summary.workspace.name).toBe('Seeded');
        expect(devBrain.currentWorkspace).toBeNull();
        expect(devBrain.settings.get('state.lastWorkspaceId')).toBe(summary.workspace.id);
        expect(devBrain.workspaces.listAll().items.map((info) => info.id)).toEqual([
          summary.workspace.id,
        ]);
      } finally {
        await devBrain.close();
      }
    },
  );
});

describe('runDevSeed', () => {
  it('creates the folder, and refuses it once it exists', { timeout: 30_000 }, async () => {
    expect(await seed()).toBe(true);
    const registry = await fs.readFile(path.join(rootPath, 'workspaces.json'), 'utf8');

    expect(await seed()).toBe(false);
    expect(console.error).toHaveBeenCalledWith(expect.stringContaining('already exists'));
    // left as it was
    expect(await fs.readFile(path.join(rootPath, 'workspaces.json'), 'utf8')).toBe(registry);
  });

  it('wipes the folder first with --reset', { timeout: 30_000 }, async () => {
    await fs.mkdir(rootPath);
    await fs.writeFile(path.join(rootPath, 'stray.txt'), 'left over');

    expect(await seed({ reset: true })).toBe(true);
    await expect(fs.stat(path.join(rootPath, 'stray.txt'))).rejects.toThrow();
  });
});
