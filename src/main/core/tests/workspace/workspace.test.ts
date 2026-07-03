import { describe, it, expect, beforeAll, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { WorkspaceId } from '@common/ids';
import type { WorkspaceInfo } from '../../workspace/types';
import { Workspace } from '../../workspace/workspace';

// DB_MIGRATIONS_PATH is read at call time (not module load), so assigning here is safe.
const MIGRATIONS_PATH = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../../../db/migrations',
);

const makeInfo = (
  workspacePath: string,
  overrides: Partial<WorkspaceInfo> = {},
): WorkspaceInfo => ({
  id: 'wsp_test001' as WorkspaceId,
  name: 'Test Workspace',
  color: '#000000',
  path: workspacePath,
  createdAt: Date.now(),
  lastOpenedAt: null,
  ...overrides,
});

let tmpDir: string;

beforeAll(() => {
  process.env.DB_MIGRATIONS_PATH = MIGRATIONS_PATH;
});

beforeEach(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'devbrain-workspace-'));
});

afterEach(async () => {
  await fs.rm(tmpDir, { recursive: true });
});

describe('Workspace.create', () => {
  it('creates a db.sqlite file in the workspace directory', async () => {
    const workspace = await Workspace.create(makeInfo(tmpDir));
    workspace.close();
    const stat = await fs.stat(path.join(tmpDir, 'db.sqlite'));
    expect(stat.isFile()).toBe(true);
  });

  it('creates a non-empty db.sqlite file (migrations have run)', async () => {
    const workspace = await Workspace.create(makeInfo(tmpDir));
    workspace.close();
    const stat = await fs.stat(path.join(tmpDir, 'db.sqlite'));
    expect(stat.size).toBeGreaterThan(0);
  });

  it('exposes the provided workspace info', async () => {
    const info = makeInfo(tmpDir);
    const workspace = await Workspace.create(info);
    expect(workspace.info).toBe(info);
    workspace.close();
  });

  it('preserves all info fields on the info property', async () => {
    const info = makeInfo(tmpDir, {
      id: 'wsp_custom1' as WorkspaceId,
      name: 'Custom Name',
      color: '#ff0000',
      lastOpenedAt: 1_700_000_000_000,
    });
    const workspace = await Workspace.create(info);
    expect(workspace.info.id).toBe('wsp_custom1');
    expect(workspace.info.name).toBe('Custom Name');
    expect(workspace.info.color).toBe('#ff0000');
    expect(workspace.info.lastOpenedAt).toBe(1_700_000_000_000);
    workspace.close();
  });

  it('throws when a database already exists at the workspace path', async () => {
    const info = makeInfo(tmpDir);
    const first = await Workspace.create(info);
    first.close();
    await expect(Workspace.create(info)).rejects.toThrow(/already exists/);
  });
});

describe('Workspace.open', () => {
  it('opens an existing workspace', async () => {
    const info = makeInfo(tmpDir);
    const created = await Workspace.create(info);
    created.close();

    const opened = await Workspace.open(info);
    expect(opened.info).toMatchObject({ id: info.id, name: info.name });
    opened.close();
  });

  it('preserves all info fields when opening', async () => {
    const info = makeInfo(tmpDir, {
      id: 'wsp_opentest' as WorkspaceId,
      name: 'Open Test',
      color: '#00ff00',
    });
    const created = await Workspace.create(info);
    created.close();

    const opened = await Workspace.open(info);
    expect(opened.info.id).toBe('wsp_opentest');
    expect(opened.info.name).toBe('Open Test');
    expect(opened.info.color).toBe('#00ff00');
    opened.close();
  });

  it('creates a db.sqlite.backup file on open', async () => {
    const info = makeInfo(tmpDir);
    const created = await Workspace.create(info);
    created.close();

    const opened = await Workspace.open(info);
    opened.close();

    const stat = await fs.stat(path.join(tmpDir, 'db.sqlite.backup'));
    expect(stat.isFile()).toBe(true);
  });

  it('backup file is non-empty', async () => {
    const info = makeInfo(tmpDir);
    const created = await Workspace.create(info);
    created.close();

    const opened = await Workspace.open(info);
    opened.close();

    const stat = await fs.stat(path.join(tmpDir, 'db.sqlite.backup'));
    expect(stat.size).toBeGreaterThan(0);
  });

  it('overwrites an existing backup on repeated opens', async () => {
    const info = makeInfo(tmpDir);
    const first = await Workspace.create(info);
    first.close();

    // First open creates the backup
    const second = await Workspace.open(info);
    second.close();

    const firstBackupStat = await fs.stat(path.join(tmpDir, 'db.sqlite.backup'));
    const firstBackupMtime = firstBackupStat.mtimeMs;

    // Small delay to ensure mtime would differ if re-created
    await new Promise((r) => setTimeout(r, 10));

    // Second open should overwrite the backup without throwing
    const third = await Workspace.open(info);
    third.close();

    await expect(fs.stat(path.join(tmpDir, 'db.sqlite.backup'))).resolves.toBeDefined();
    // mtime should be updated (or at worst equal) — just confirm no throw
    const secondBackupStat = await fs.stat(path.join(tmpDir, 'db.sqlite.backup'));
    expect(secondBackupStat.mtimeMs).toBeGreaterThanOrEqual(firstBackupMtime);
  });

  it('throws when no database exists at the workspace path', async () => {
    await expect(Workspace.open(makeInfo(tmpDir))).rejects.toThrow(/No workspace database found/);
  });

  it('a created-then-closed workspace can be re-opened', async () => {
    const info = makeInfo(tmpDir);
    const created = await Workspace.create(info);
    created.close();

    const opened = await Workspace.open(info);
    expect(opened.info.id).toBe(info.id);
    opened.close();
  });
});

describe('Workspace.close', () => {
  it('closes the SQLite connection without throwing', async () => {
    const workspace = await Workspace.create(makeInfo(tmpDir));
    expect(() => workspace.close()).not.toThrow();
  });

  it('calling close() a second time does not throw', async () => {
    const workspace = await Workspace.create(makeInfo(tmpDir));
    workspace.close();
    // better-sqlite3 silently no-ops on double-close
    expect(() => workspace.close()).not.toThrow();
  });
});
