import { describe, it, expect, beforeAll, beforeEach, afterEach, vi } from 'vitest';
import fs from 'node:fs/promises';
import fsSync from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { WorkspaceId } from '@common/ids';
import type { WorkspaceInfo } from '../../workspace/types';
import { Workspace } from '../../workspace/workspace';
import { WorkspaceMigrationError } from '../../shared/errors';
import { migrationsWithExtra } from '../utils';
import Database from 'better-sqlite3';
import { FakeCipher } from '../__mocks__/fake-cipher';
import { createFakeProvider, FAKE_API_KEY, fakeRegistry } from '../sync/fake-provider';
import { Provider } from '../../integrations/types';
import { TaskPriority, TaskStatus } from '../../tasks/types';

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
  process.env.DB_MIGRATIONS_PATH = MIGRATIONS_PATH;
  await fs.rm(tmpDir, { recursive: true });
});

describe('Workspace.create', () => {
  it('creates a db.sqlite file in the workspace directory', async () => {
    const workspace = await Workspace.create(makeInfo(tmpDir));
    await workspace.close();
    const stat = await fs.stat(path.join(tmpDir, 'db.sqlite'));
    expect(stat.isFile()).toBe(true);
  });

  it('creates a non-empty db.sqlite file (migrations have run)', async () => {
    const workspace = await Workspace.create(makeInfo(tmpDir));
    await workspace.close();
    const stat = await fs.stat(path.join(tmpDir, 'db.sqlite'));
    expect(stat.size).toBeGreaterThan(0);
  });

  it('exposes the provided workspace info', async () => {
    const info = makeInfo(tmpDir);
    const workspace = await Workspace.create(info);
    expect(workspace.info).toBe(info);
    await workspace.close();
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
    await workspace.close();
  });

  it('throws when a database already exists at the workspace path', async () => {
    const info = makeInfo(tmpDir);
    const first = await Workspace.create(info);
    await first.close();
    await expect(Workspace.create(info)).rejects.toThrow(/already exists/);
  });
});

describe('Workspace.open', () => {
  it('opens an existing workspace', async () => {
    const info = makeInfo(tmpDir);
    const created = await Workspace.create(info);
    await created.close();

    const opened = await Workspace.open(info);
    expect(opened.info).toMatchObject({ id: info.id, name: info.name });
    await opened.close();
  });

  it('preserves all info fields when opening', async () => {
    const info = makeInfo(tmpDir, {
      id: 'wsp_opentest' as WorkspaceId,
      name: 'Open Test',
      color: '#00ff00',
    });
    const created = await Workspace.create(info);
    await created.close();

    const opened = await Workspace.open(info);
    expect(opened.info.id).toBe('wsp_opentest');
    expect(opened.info.name).toBe('Open Test');
    expect(opened.info.color).toBe('#00ff00');
    await opened.close();
  });

  it('creates a db.sqlite.backup file on open', async () => {
    const info = makeInfo(tmpDir);
    const created = await Workspace.create(info);
    await created.close();

    const opened = await Workspace.open(info);
    await opened.close();

    const stat = await fs.stat(path.join(tmpDir, 'db.sqlite.backup'));
    expect(stat.isFile()).toBe(true);
  });

  it('backup file is non-empty', async () => {
    const info = makeInfo(tmpDir);
    const created = await Workspace.create(info);
    await created.close();

    const opened = await Workspace.open(info);
    await opened.close();

    const stat = await fs.stat(path.join(tmpDir, 'db.sqlite.backup'));
    expect(stat.size).toBeGreaterThan(0);
  });

  it('overwrites an existing backup on repeated opens', async () => {
    const info = makeInfo(tmpDir);
    const first = await Workspace.create(info);
    await first.close();

    // First open creates the backup
    const second = await Workspace.open(info);
    await second.close();

    const firstBackupStat = await fs.stat(path.join(tmpDir, 'db.sqlite.backup'));
    const firstBackupMtime = firstBackupStat.mtimeMs;

    // Small delay to ensure mtime would differ if re-created
    await new Promise((r) => setTimeout(r, 10));

    // Second open should overwrite the backup without throwing
    const third = await Workspace.open(info);
    await third.close();

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
    await created.close();

    const opened = await Workspace.open(info);
    expect(opened.info.id).toBe(info.id);
    await opened.close();
  });
});

describe('Workspace.close', () => {
  it('closes the SQLite connection without throwing', async () => {
    const workspace = await Workspace.create(makeInfo(tmpDir));
    await expect(workspace.close()).resolves.toBeUndefined();
  });

  it('calling close() a second time does not throw', async () => {
    const workspace = await Workspace.create(makeInfo(tmpDir));
    await workspace.close();
    // better-sqlite3 silently no-ops on double-close
    await expect(workspace.close()).resolves.toBeUndefined();
  });
});

describe('Workspace — WAL', () => {
  function journalMode(dbPath: string): string {
    const sqlite = new Database(dbPath, { readonly: true });
    try {
      return sqlite.pragma('journal_mode', { simple: true }) as string;
    } finally {
      sqlite.close();
    }
  }

  it('creates and opens the database in WAL mode', async () => {
    const info = makeInfo(tmpDir);
    const created = await Workspace.create(info);
    await created.close();
    expect(journalMode(path.join(tmpDir, 'db.sqlite'))).toBe('wal');

    const opened = await Workspace.open(info);
    await opened.close();
    expect(journalMode(path.join(tmpDir, 'db.sqlite'))).toBe('wal');
  });

  it('the backup taken on open includes writes still in the WAL', async () => {
    const info = makeInfo(tmpDir);
    const created = await Workspace.create(info);
    await created.close();

    // another connection writes and stays open, so its write is in the WAL, not the main file
    const dbPath = path.join(tmpDir, 'db.sqlite');
    const writer = new Database(dbPath);
    try {
      writer
        .prepare(`INSERT INTO projects (id, title, due_date) VALUES ('prj_inwal', 'In WAL', 0)`)
        .run();
      expect((await fs.stat(`${dbPath}-wal`)).size).toBeGreaterThan(0);

      const opened = await Workspace.open(info);
      await opened.close();
    } finally {
      writer.close();
    }

    const backup = new Database(path.join(tmpDir, 'db.sqlite.backup'), { readonly: true });
    try {
      expect(backup.prepare(`SELECT title FROM projects`).pluck().all()).toEqual(['In WAL']);
      expect(backup.pragma('integrity_check', { simple: true })).toBe('ok');
    } finally {
      backup.close();
    }
  });
});

describe('Workspace.close — sync', () => {
  it('closing mid-sync waits for the run, writes nothing and does not throw', async () => {
    const info = makeInfo(tmpDir);
    const provider = createFakeProvider();
    const options = { cipher: new FakeCipher(), providers: fakeRegistry(provider) };
    const workspace = await Workspace.create(info, options);
    workspace.sync.start();

    // connecting starts the initial sync; the provider answers after the close has begun
    let pullStartedAt = 0;
    provider.tasks.script({
      tasks: [issue()],
      delayMs: 50,
      onPull: () => {
        pullStartedAt = performance.now();
      },
    });
    await workspace.integrations.connectWithApiKey(Provider.LINEAR, FAKE_API_KEY);
    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(provider.tasks.pulls).toHaveLength(1);

    await expect(workspace.close()).resolves.toBeUndefined();
    // close waited for the pull to answer before closing SQLite
    expect(performance.now() - pullStartedAt).toBeGreaterThanOrEqual(45);
    // anything still running would have thrown "database is closed" by now
    await new Promise((resolve) => setTimeout(resolve, 100));

    const reopened = await Workspace.open(info, options);
    try {
      expect((await reopened.tasks.listTasks()).items).toEqual([]);
      const [integration] = await reopened.integrations.list();
      expect(integration.sources[0]).toMatchObject({ lastSyncedAt: null, lastError: null });
    } finally {
      await reopened.close();
    }
  });

  it('closing an idle started workspace leaves no timers behind', async () => {
    vi.useFakeTimers();
    try {
      const workspace = await Workspace.create(makeInfo(tmpDir));
      workspace.sync.start();
      expect(vi.getTimerCount()).toBeGreaterThan(0);
      await workspace.close();
      expect(vi.getTimerCount()).toBe(0);
    } finally {
      vi.useRealTimers();
    }
  });
});

describe('Workspace.open — failed migrations', () => {
  // the workspace lives in its own folder so the extra migrations folder sits beside it
  let workspaceDir: string;
  let info: WorkspaceInfo;
  let projectId: string;

  beforeEach(async () => {
    workspaceDir = path.join(tmpDir, 'workspace');
    await fs.mkdir(workspaceDir);
    info = makeInfo(workspaceDir);
    const created = await Workspace.create(info);
    projectId = (await created.projects.createProject({ title: 'Kept', dueDate: new Date() })).id;
    await created.close();
  });

  /** points Workspace at the real migrations plus one extra, `sql` */
  function useExtraMigration(tag: string, sql: string) {
    process.env.DB_MIGRATIONS_PATH = migrationsWithExtra(path.join(tmpDir, tag), tag, sql);
  }

  async function openFailure(): Promise<WorkspaceMigrationError> {
    const error = await Workspace.open(info).then(
      () => null,
      (e: unknown) => e,
    );
    expect(error).toBeInstanceOf(WorkspaceMigrationError);
    return error as WorkspaceMigrationError;
  }

  function readDb<T>(query: (sqlite: Database.Database) => T): T {
    const sqlite = new Database(path.join(workspaceDir, 'db.sqlite'), { readonly: true });
    try {
      return query(sqlite);
    } finally {
      sqlite.close();
    }
  }

  it('restores the backup when the migration committed broken references', async () => {
    useExtraMigration(
      '0099_dangling',
      `INSERT INTO tasks (id, title, project_id) VALUES ('tsk_dangling', 'Dangling', 'prj_missing');`,
    );
    const error = await openFailure();

    expect(error.code).toBe('workspace_migration');
    expect(error.committed).toBe(true);
    expect(error.restoredFromBackup).toBe(true);
    expect(error.backupPath).toBe(path.join(workspaceDir, 'db.sqlite.backup'));
    expect(error.message).toMatch(/restored from the backup/);

    // the committed migration and its row are gone; the data from before the open is intact
    readDb((sqlite) => {
      expect(
        sqlite.prepare(`SELECT id FROM tasks WHERE id = 'tsk_dangling'`).get(),
      ).toBeUndefined();
      expect(sqlite.prepare(`SELECT id FROM projects`).pluck().all()).toEqual([projectId]);
      expect(
        sqlite.prepare('SELECT max(created_at) FROM __drizzle_migrations').pluck().get(),
      ).not.toBe(null);
    });

    // with the bad migration gone, the restored workspace opens normally
    process.env.DB_MIGRATIONS_PATH = MIGRATIONS_PATH;
    const opened = await Workspace.open(info);
    expect((await opened.projects.getById(projectId as never)).title).toBe('Kept');
    await opened.close();
  });

  it('leaves the database as it was, without restoring, when the migration rolled back', async () => {
    useExtraMigration(
      '0099_broken',
      `CREATE TABLE rolled_back (id text);--> statement-breakpoint
INSERT INTO no_such_table VALUES (1);`,
    );
    const backupPath = path.join(workspaceDir, 'db.sqlite.backup');
    const error = await openFailure();

    expect(error.committed).toBe(false);
    expect(error.restoredFromBackup).toBe(false);
    expect(error.backupPath).toBe(backupPath);
    expect(error.message).toMatch(/no changes were made/);

    readDb((sqlite) => {
      expect(
        sqlite.prepare(`SELECT 1 FROM sqlite_master WHERE name = 'rolled_back'`).get(),
      ).toBeUndefined();
      expect(sqlite.prepare(`SELECT id FROM projects`).pluck().all()).toEqual([projectId]);
    });

    // the failed open closed its connection, so the workspace opens again straight away
    process.env.DB_MIGRATIONS_PATH = MIGRATIONS_PATH;
    const opened = await Workspace.open(info);
    await opened.close();
  });

  it('removes WAL files left beside the database before restoring the backup', async () => {
    useExtraMigration(
      '0099_dangling',
      `INSERT INTO tasks (id, title, project_id) VALUES ('tsk_dangling', 'Dangling', 'prj_missing');`,
    );
    const dbPath = path.join(workspaceDir, 'db.sqlite');
    // the failed open's close leaves a WAL behind, as a connection that could not checkpoint does
    const close = Database.prototype.close;
    const spy = vi.spyOn(Database.prototype, 'close').mockImplementationOnce(function (
      this: Database.Database,
    ) {
      close.call(this);
      fsSync.writeFileSync(`${dbPath}-wal`, 'stale');
      fsSync.writeFileSync(`${dbPath}-shm`, 'stale');
      return this;
    });
    try {
      const error = await openFailure();
      expect(error.restoredFromBackup).toBe(true);
    } finally {
      spy.mockRestore();
    }

    expect(fsSync.existsSync(`${dbPath}-wal`)).toBe(false);
    expect(fsSync.existsSync(`${dbPath}-shm`)).toBe(false);
    readDb((sqlite) => {
      expect(sqlite.prepare(`SELECT id FROM projects`).pluck().all()).toEqual([projectId]);
    });
  });

  it('reports a failed restore without claiming the database was restored', async () => {
    useExtraMigration(
      '0099_dangling',
      `INSERT INTO tasks (id, title, project_id) VALUES ('tsk_dangling', 'Dangling', 'prj_missing');`,
    );
    const copyFile = vi.spyOn(fs, 'copyFile').mockRejectedValueOnce(new Error('disk full'));
    try {
      const error = await openFailure();
      expect(copyFile).toHaveBeenCalledOnce();
      expect(error.committed).toBe(true);
      expect(error.restoredFromBackup).toBe(false);
      expect(error.message).toMatch(/restoring the backup at .* failed/);
      expect((error.cause as Error).message).toBe('disk full');
    } finally {
      copyFile.mockRestore();
    }
  });
});

function issue() {
  return {
    externalId: 'issue-1',
    key: 'ENG-1',
    url: 'https://linear.app/acme/issue/ENG-1',
    title: 'Issue 1',
    description: null,
    status: TaskStatus.NOT_STARTED,
    priority: TaskPriority.LOW,
    statusLabel: 'Todo',
    priorityLabel: 'Low',
    startDate: null,
    dueDate: null,
    completedAt: null,
    createdAt: new Date('2026-10-01T12:00:00Z'),
    updatedAt: new Date('2026-10-01T12:00:00Z'),
    parentExternalId: null,
    parentKey: null,
    parentTitle: null,
    projectExternalId: null,
    assignedToViewer: true,
  };
}
