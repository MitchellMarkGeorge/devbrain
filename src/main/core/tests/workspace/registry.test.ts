import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs/promises';
import fsSync from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { WorkspaceId } from '@common/ids';
import type { WorkspaceInfo } from '../../workspace/types';
import { createFileAtomicSync, writeFileAtomicSync } from '../../local/atomic';
import { scaffoldDevBrain } from '../../local/scaffold';
import { FileExistsError } from '../../shared/errors';
import { recoverRegistry, writeRegistry, type WorkspaceRegistry } from '../../workspace/registry';

import { openMemorySettingsStore } from '../__mocks__/memory-settings-store';
import { WORKSPACE_OPTIONS } from '../utils';

// Faults injected into node:fs, for atomically as much as our own code: vitest.config.ts inlines
// atomically and stubborn-fs so this mock reaches them. afterEach clears them.
const faults = vi.hoisted(() => ({
  // the next write to a file descriptor writes half its data, then fails as on a full disk
  writeHalfway: false,
  // a rename onto a path this matches fails
  failRename: null as ((to: string) => boolean) | null,
}));

vi.mock('node:fs', async (importOriginal) => {
  const real = (await importOriginal<{ default: typeof import('node:fs') }>()).default;
  const halfway = (data: unknown): string | null => {
    if (!faults.writeHalfway || typeof data !== 'string') return null;
    faults.writeHalfway = false;
    return data.slice(0, data.length / 2);
  };
  const noSpace = () =>
    Object.assign(new Error('ENOSPC: no space left on device'), { code: 'ENOSPC' });
  const mocked: typeof import('node:fs') = {
    ...real,
    writeSync: ((fd: number, data: unknown, ...rest: unknown[]) => {
      const half = halfway(data);
      if (half === null)
        return (real.writeSync as (...args: unknown[]) => number)(fd, data, ...rest);
      real.writeSync(fd, half);
      throw noSpace();
    }) as typeof real.writeSync,
    writeFileSync: ((file: unknown, data: unknown, ...rest: unknown[]) => {
      const half = typeof file === 'number' ? halfway(data) : null;
      if (half === null) {
        return (real.writeFileSync as (...args: unknown[]) => void)(file, data, ...rest);
      }
      real.writeFileSync(file as number, half);
      throw noSpace();
    }) as typeof real.writeFileSync,
    renameSync: (from, to) => {
      if (faults.failRename?.(String(to))) {
        throw Object.assign(new Error('EIO: i/o error, rename'), { code: 'EIO' });
      }
      real.renameSync(from, to);
    },
  };
  return { ...mocked, default: mocked };
});

import { DevBrain } from '../../devbrain';
import { WorkspaceService } from '../../workspace/service';

let rootPath: string;

beforeEach(async () => {
  rootPath = path.join(await fs.mkdtemp(path.join(os.tmpdir(), 'devbrain-registry-')), 'brain');
  await scaffoldDevBrain(rootPath);
});

afterEach(async () => {
  faults.writeHalfway = false;
  faults.failRename = null;
  vi.restoreAllMocks();
  await fs.rm(path.dirname(rootPath), { recursive: true });
});

const registryPath = () => path.join(rootPath, 'workspaces.json');
const backupPath = () => path.join(rootPath, 'workspaces.json.bak');
const readJson = async (filePath: string) => JSON.parse(await fs.readFile(filePath, 'utf8'));

const makeInfo = (id: string, overrides: Partial<WorkspaceInfo> = {}): WorkspaceInfo => ({
  id: id as WorkspaceId,
  name: `Workspace ${id}`,
  color: '#123456',
  path: path.join(rootPath, 'workspaces', id),
  createdAt: 1_700_000_000_000,
  lastOpenedAt: null,
  ...overrides,
});

const registryOf = (...infos: WorkspaceInfo[]): WorkspaceRegistry =>
  Object.fromEntries(infos.map((info) => [info.id, info])) as WorkspaceRegistry;

// a workspace directory with a database file, as WorkspaceService.create leaves one
async function makeWorkspaceDirectory(id: string): Promise<void> {
  const dir = path.join(rootPath, 'workspaces', id);
  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(path.join(dir, 'db.sqlite'), '');
}

// files at the root other than the registry, its backup and settings.json, such as temp files
async function strayFiles(): Promise<string[]> {
  const known = ['settings.json', 'workspaces.json', 'workspaces.json.bak', 'workspaces'];
  return (await fs.readdir(rootPath)).filter((name) => !known.includes(name));
}

describe('writeFileAtomicSync', () => {
  it('replaces the file and leaves no temp file', async () => {
    writeFileAtomicSync(registryPath(), '{"a":1}');
    expect(await fs.readFile(registryPath(), 'utf8')).toBe('{"a":1}');
    expect(await strayFiles()).toEqual([]);
  });

  it('keeps the previous content when the write stops partway', async () => {
    faults.writeHalfway = true;
    expect(() =>
      writeFileAtomicSync(registryPath(), JSON.stringify({ long: 'x'.repeat(100) })),
    ).toThrow(/ENOSPC/);
    expect(faults.writeHalfway).toBe(false);
    expect(await readJson(registryPath())).toEqual({});
    expect(await strayFiles()).toEqual([]);
  });

  it('keeps the previous content when the rename fails', async () => {
    faults.failRename = () => true;
    expect(() => writeFileAtomicSync(registryPath(), '{"a":1}')).toThrow(/EIO/);
    expect(await readJson(registryPath())).toEqual({});
    expect(await strayFiles()).toEqual([]);
  });
});

describe('createFileAtomicSync', () => {
  it('never overwrites, and leaves no temp file', async () => {
    expect(() => createFileAtomicSync(registryPath(), '{"a":1}')).toThrow(FileExistsError);
    expect(await readJson(registryPath())).toEqual({});
    expect(await strayFiles()).toEqual([]);
  });

  it('creates nothing when the write stops partway', async () => {
    faults.writeHalfway = true;
    const target = path.join(rootPath, 'new.json');
    expect(() => createFileAtomicSync(target, '{"a":1}')).toThrow(/ENOSPC/);
    expect(fsSync.existsSync(target)).toBe(false);
    expect(await strayFiles()).toEqual([]);
  });
});

describe('writeRegistry', () => {
  it('writes the registry and the same content to the backup', async () => {
    const registry = registryOf(makeInfo('wsp_a'));
    writeRegistry(rootPath, registry);
    expect(await readJson(registryPath())).toEqual(registry);
    expect(await readJson(backupPath())).toEqual(registry);
  });

  it('reports a failed backup write without failing, keeping the previous backup', async () => {
    const first = registryOf(makeInfo('wsp_a'));
    writeRegistry(rootPath, first);
    faults.failRename = (to) => to === backupPath();
    const report = vi.fn();
    const second = registryOf(makeInfo('wsp_a'), makeInfo('wsp_b'));
    writeRegistry(rootPath, second, report);
    expect(report).toHaveBeenCalledOnce();
    expect(await readJson(registryPath())).toEqual(second);
    expect(await readJson(backupPath())).toEqual(first);
  });
});

describe('WorkspaceService — failed registry writes', () => {
  // the directories under workspaces/, which create makes before writing the registry
  async function workspaceDirectories(): Promise<string[]> {
    return fs.readdir(path.join(rootPath, 'workspaces')).catch(() => []);
  }

  it('a rename failure while creating a workspace leaves the previous registry', async () => {
    const existing = registryOf(makeInfo('wsp_a'));
    writeRegistry(rootPath, existing);
    faults.failRename = () => true;
    const service = new WorkspaceService(rootPath, WORKSPACE_OPTIONS);
    await expect(service.create({ name: 'New', color: '#000000' })).rejects.toThrow(/EIO/);
    expect(await readJson(registryPath())).toEqual(existing);
    expect(service.listAll().items.map((info) => info.id)).toEqual(['wsp_a']);
    // its directory, database included, is removed, so recoverRegistry can't bring it back
    expect(await workspaceDirectories()).toEqual([]);
  });

  it('a rename failure while updating a workspace leaves the previous registry and sends nothing', async () => {
    const existing = registryOf(makeInfo('wsp_a'));
    writeRegistry(rootPath, existing);
    const service = new WorkspaceService(rootPath, WORKSPACE_OPTIONS);
    const changes = vi.fn();
    service.onChange(changes);
    faults.failRename = () => true;

    await expect(service.update('wsp_a' as WorkspaceId, { name: 'Renamed' })).rejects.toThrow(
      /EIO/,
    );

    faults.failRename = null;
    expect(await readJson(registryPath())).toEqual(existing);
    expect(service.getById('wsp_a' as WorkspaceId)).toEqual(existing['wsp_a' as WorkspaceId]);
    expect(changes).not.toHaveBeenCalled();
  });

  it('a write stopping partway while creating a workspace leaves the previous registry', async () => {
    const existing = registryOf(makeInfo('wsp_a'));
    writeRegistry(rootPath, existing);
    faults.writeHalfway = true;
    const service = new WorkspaceService(rootPath, WORKSPACE_OPTIONS);
    await expect(service.create({ name: 'New', color: '#000000' })).rejects.toThrow(/ENOSPC/);
    expect(await readJson(registryPath())).toEqual(existing);
    expect(await workspaceDirectories()).toEqual([]);
  });
});

describe('recoverRegistry', () => {
  it('does nothing to a valid registry', async () => {
    const log = vi.fn();
    expect(await recoverRegistry(rootPath, log)).toBeNull();
    expect(log).not.toHaveBeenCalled();
    expect(await strayFiles()).toEqual([]);
  });

  it('restores an invalid registry from the backup, keeping a copy of the invalid one', async () => {
    const registry = registryOf(makeInfo('wsp_a'));
    writeRegistry(rootPath, registry);
    await fs.writeFile(registryPath(), '{"wsp_a": {"id": "wsp_');
    const log = vi.fn();

    expect(await recoverRegistry(rootPath, log)).toBe('backup');
    expect(await readJson(registryPath())).toEqual(registry);
    expect(log).toHaveBeenCalledWith(expect.stringContaining('workspaces.json.bak'));
    const [corrupt] = await strayFiles();
    expect(corrupt).toMatch(/^workspaces\.json\.corrupt-\d+$/);
    expect(await fs.readFile(path.join(rootPath, corrupt), 'utf8')).toBe('{"wsp_a": {"id": "wsp_');
  });

  it('adds workspace directories the backup lacks', async () => {
    writeRegistry(rootPath, registryOf(makeInfo('wsp_a')));
    await makeWorkspaceDirectory('wsp_a');
    await makeWorkspaceDirectory('wsp_b');
    await fs.rm(registryPath());

    expect(await recoverRegistry(rootPath, vi.fn())).toBe('backup');
    const restored = await readJson(registryPath());
    expect(restored.wsp_a).toEqual(makeInfo('wsp_a'));
    expect(restored.wsp_b).toMatchObject({
      id: 'wsp_b',
      path: path.join(rootPath, 'workspaces', 'wsp_b'),
    });
  });

  it('rebuilds from the workspace directories without a backup, skipping ones with no database', async () => {
    await makeWorkspaceDirectory('wsp_a');
    await fs.mkdir(path.join(rootPath, 'workspaces', 'wsp_unfinished'));
    await fs.writeFile(registryPath(), 'garbage');

    expect(await recoverRegistry(rootPath, vi.fn())).toBe('directories');
    const restored = await readJson(registryPath());
    expect(Object.keys(restored)).toEqual(['wsp_a']);
    expect(restored.wsp_a).toMatchObject({ name: 'Recovered workspace wsp_a', lastOpenedAt: null });
    expect(await readJson(backupPath())).toEqual(restored);
  });

  it('leaves a missing registry with no backup and no workspaces directory alone', async () => {
    await fs.rm(registryPath());
    expect(await recoverRegistry(rootPath, vi.fn())).toBeNull();
    expect(fsSync.existsSync(registryPath())).toBe(false);
  });
});

describe('DevBrain.open — a corrupt registry', () => {
  it('starts from the backup, and every workspace in it is listed', async () => {
    const registry = registryOf(
      makeInfo('wsp_a'),
      makeInfo('wsp_b', { createdAt: 1_800_000_000_000 }),
    );
    writeRegistry(rootPath, registry);
    // what an interrupted, non-atomic write left behind
    await fs.writeFile(registryPath(), '');
    vi.spyOn(console, 'warn').mockImplementation(() => {});

    const devBrain = await DevBrain.open({
      path: rootPath,
      settingsStore: openMemorySettingsStore,
      workspace: WORKSPACE_OPTIONS,
    });
    expect(devBrain.workspaces.listAll().items.map((info) => info.id)).toEqual(['wsp_a', 'wsp_b']);
    expect(console.warn).toHaveBeenCalledOnce();
    await devBrain.close();
  });
});
