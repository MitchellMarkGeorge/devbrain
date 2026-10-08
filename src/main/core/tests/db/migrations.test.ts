import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { DatabaseSync } from 'node:sqlite';
import { drizzle, migrate } from '@main/db/node-sqlite';
import { runMigrations } from '@main/db/migrate';
import { WorkspaceMigrationError } from '@main/core/shared/errors';
import { migrationsWithExtra, pluckAll, pluckGet } from '../utils';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// Migrates a database seeded at an older migration to the latest one through runMigrations, as
// Workspace.open does, and checks that table rebuilds keep every row, every relationship and every
// index and check constraint.

const MIGRATIONS_PATH = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../../../db/migrations',
);

interface Journal {
  entries: { idx: number; tag: string }[];
}

let tmpDir: string;

beforeAll(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'devbrain-migrations-'));
});

afterAll(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

/** a copy of the migrations folder that stops at (and includes) `lastIdx` */
function migrationsUpTo(lastIdx: number): string {
  const dir = path.join(tmpDir, `upto-${lastIdx}`);
  fs.cpSync(MIGRATIONS_PATH, dir, { recursive: true });
  const journalPath = path.join(dir, 'meta/_journal.json');
  const journal = JSON.parse(fs.readFileSync(journalPath, 'utf8')) as Journal;
  for (const entry of journal.entries.filter((e) => e.idx > lastIdx)) {
    fs.rmSync(path.join(dir, `${entry.tag}.sql`));
  }
  journal.entries = journal.entries.filter((e) => e.idx <= lastIdx);
  fs.writeFileSync(journalPath, JSON.stringify(journal));
  return dir;
}

function openDb() {
  const sqlite = new DatabaseSync(':memory:');
  sqlite.exec('PRAGMA foreign_keys = ON');
  return { sqlite, db: drizzle({ client: sqlite, casing: 'snake_case' }) };
}

function seed(sqlite: DatabaseSync) {
  sqlite.exec(`
    INSERT INTO projects (id, title, due_date, status, completed_at) VALUES
      ('prj_a', 'Project A', 1000, 1, NULL),
      ('prj_b', 'Project B', 2000, 4, 3000);

    INSERT INTO events (id, title, start_at, end_at) VALUES ('evt_a', 'Event', 1000, 2000);

    INSERT INTO notes (id, title, file_path, project_id) VALUES
      ('nte_a', 'Project note', 'a.md', 'prj_a'),
      ('nte_b', 'Event note', 'b.md', NULL);
    UPDATE notes SET linked_event_id = 'evt_a' WHERE id = 'nte_b';

    INSERT INTO tasks (id, title, due_date, project_id, linked_note_id) VALUES
      ('tsk_a', 'Parent', 1000, 'prj_a', 'nte_a');
    INSERT INTO tasks (id, title, due_date, project_id, parent_task_id, linked_event_id) VALUES
      ('tsk_b', 'Child', 1000, 'prj_a', 'tsk_a', 'evt_a');
    INSERT INTO tasks (id, title, due_date, project_id, status, completed_at, archived_at) VALUES
      ('tsk_c', 'Done', 1000, 'prj_b', 3, 2000, 3000);

    INSERT INTO notes (id, title, file_path, linked_task_id) VALUES ('nte_c', 'Task note', 'c.md', 'tsk_a');
  `);
}

const TABLES = ['projects', 'tasks', 'notes', 'events'] as const;

function snapshot(sqlite: DatabaseSync) {
  return Object.fromEntries(
    TABLES.map((t) => [t, sqlite.prepare(`SELECT * FROM ${t} ORDER BY id`).all()]),
  );
}

function schemaObjects(sqlite: DatabaseSync, type: 'index' | 'trigger') {
  return (
    sqlite
      .prepare(
        `SELECT name, tbl_name FROM sqlite_master WHERE type = ? AND name NOT LIKE 'sqlite_%'`,
      )
      .all(type) as { name: string; tbl_name: string }[]
  )
    .map((r) => `${r.tbl_name}.${r.name}`)
    .sort();
}

function checkConstraints(sqlite: DatabaseSync, table: string): string[] {
  const { sql } = sqlite
    .prepare(`SELECT sql FROM sqlite_master WHERE type = 'table' AND name = ?`)
    .get(table) as { sql: string };
  return [...sql.matchAll(/CONSTRAINT "(\w+)" CHECK/g)].map((m) => m[1]);
}

function columnNotNull(sqlite: DatabaseSync, table: string, column: string): boolean {
  const cols = sqlite.prepare(`PRAGMA table_info(${table})`).all() as {
    name: string;
    notnull: number;
  }[];
  return cols.find((c) => c.name === column)!.notnull === 1;
}

describe('migration 0016 — nullable due dates', () => {
  it('rebuilds tasks and projects without losing rows, links, indexes or checks', () => {
    const { sqlite, db } = openDb();
    migrate(db, { migrationsFolder: migrationsUpTo(15) });
    seed(sqlite);

    const before = snapshot(sqlite);
    const indexesBefore = schemaObjects(sqlite, 'index');
    const triggersBefore = schemaObjects(sqlite, 'trigger');
    const checksBefore = {
      tasks: checkConstraints(sqlite, 'tasks'),
      projects: checkConstraints(sqlite, 'projects'),
    };
    expect(columnNotNull(sqlite, 'tasks', 'due_date')).toBe(true);
    expect(columnNotNull(sqlite, 'projects', 'due_date')).toBe(true);

    // stop at 0016 so the index comparison below covers this migration alone
    runMigrations(sqlite, db, migrationsUpTo(16));

    // every row, including every foreign key column, is unchanged
    expect(snapshot(sqlite)).toEqual(before);
    // the same indexes, plus the nulls-last due-date indexes this migration adds
    expect(schemaObjects(sqlite, 'index')).toEqual(
      [
        ...indexesBefore,
        'projects.idx_projects_due_date_nulls_last_id',
        'tasks.idx_tasks_due_date_nulls_last_id',
      ].sort(),
    );
    expect(schemaObjects(sqlite, 'trigger')).toEqual(triggersBefore);
    expect(checkConstraints(sqlite, 'tasks')).toEqual(checksBefore.tasks);
    expect(checkConstraints(sqlite, 'projects')).toEqual(checksBefore.projects);
    expect(sqlite.prepare('PRAGMA foreign_key_check').all()).toEqual([]);
    expect(pluckGet(sqlite, 'PRAGMA integrity_check')).toBe('ok');

    expect(columnNotNull(sqlite, 'tasks', 'due_date')).toBe(false);
    expect(columnNotNull(sqlite, 'projects', 'due_date')).toBe(false);
    sqlite.close();
  });

  it('keeps foreign keys enforced and accepts null due dates afterwards', () => {
    const { sqlite, db } = openDb();
    runMigrations(sqlite, db, MIGRATIONS_PATH);
    expect(pluckGet(sqlite, 'PRAGMA foreign_keys')).toBe(1);

    sqlite.exec(`INSERT INTO projects (id, title) VALUES ('prj_x', 'Undated')`);
    sqlite.exec(`INSERT INTO tasks (id, title, project_id) VALUES ('tsk_x', 'Undated', 'prj_x')`);
    expect(() =>
      sqlite.exec(`INSERT INTO tasks (id, title, project_id) VALUES ('tsk_y', 'Bad', 'prj_nope')`),
    ).toThrow(/FOREIGN KEY/);
    // the completed_at check survived the rebuild
    expect(() =>
      sqlite.exec(`INSERT INTO tasks (id, title, status) VALUES ('tsk_z', 'Bad', 3)`),
    ).toThrow(/CHECK/);
    sqlite.close();
  });
});

const INTEGRATION_TABLES = ['integrations', 'external_sources', 'external_links'] as const;

function tableNames(sqlite: DatabaseSync): string[] {
  return pluckAll(
    sqlite,
    `SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name`,
  ) as string[];
}

describe('migration 0017 — integration tables', () => {
  it('applies to a fresh database', () => {
    const { sqlite, db } = openDb();
    runMigrations(sqlite, db, MIGRATIONS_PATH);

    expect(tableNames(sqlite)).toEqual(expect.arrayContaining([...INTEGRATION_TABLES]));
    expect(checkConstraints(sqlite, 'external_links')).toEqual(['one_entity']);
    expect(
      schemaObjects(sqlite, 'index').filter((i) => /^(integrations|external_)/.test(i)),
    ).toEqual([
      'external_links.external_links_eventId_unique',
      'external_links.external_links_projectId_unique',
      'external_links.external_links_taskId_unique',
      'external_links.idx_external_links_source_id_state',
      'external_links.uq_external_links_source_external_id',
      'external_sources.uq_external_sources_integration_type',
      'integrations.uq_integrations_provider_account',
    ]);
    expect(pluckGet(sqlite, 'PRAGMA integrity_check')).toBe('ok');
    sqlite.close();
  });

  it('applies to a database seeded at 0016 without touching existing rows', () => {
    const { sqlite, db } = openDb();
    migrate(db, { migrationsFolder: migrationsUpTo(16) });
    seed(sqlite);
    // undated rows only exist from 0016 on
    sqlite.exec(`INSERT INTO tasks (id, title) VALUES ('tsk_undated', 'Undated')`);

    const before = snapshot(sqlite);
    const indexesBefore = schemaObjects(sqlite, 'index');
    for (const table of INTEGRATION_TABLES) expect(tableNames(sqlite)).not.toContain(table);

    runMigrations(sqlite, db, MIGRATIONS_PATH);

    expect(snapshot(sqlite)).toEqual(before);
    // only the new tables' indexes were added
    const added = schemaObjects(sqlite, 'index').filter((i) => !indexesBefore.includes(i));
    expect(added.every((i) => /^(integrations|external_sources|external_links)\./.test(i))).toBe(
      true,
    );
    expect(sqlite.prepare('PRAGMA foreign_key_check').all()).toEqual([]);

    // the new tables work against the seeded rows, foreign keys included
    sqlite.exec(`
      INSERT INTO integrations (id, provider, auth_type, account_id, account_label, credentials)
        VALUES ('int_a', 'linear', 'api_key', 'org:user', 'Ada', x'00');
      INSERT INTO external_sources (id, integration_id, source_type) VALUES ('src_a', 'int_a', 'tasks');
      INSERT INTO external_links
        (id, source_id, provider, task_id, external_id, external_url, external_updated_at, last_synced_at)
        VALUES ('xln_a', 'src_a', 'linear', 'tsk_a', 'issue-a', 'https://linear.app/a', 1000, 1000);
    `);
    sqlite.exec(`DELETE FROM integrations WHERE id = 'int_a'`);
    expect(pluckAll(sqlite, `SELECT source_id FROM external_links`)).toEqual([null]);
    sqlite.close();
  });
});

// a migration that fails partway: the first statement succeeds, the second does not
const BROKEN_SQL = `CREATE TABLE rolled_back (id text);--> statement-breakpoint
INSERT INTO no_such_table VALUES (1);`;
// a migration that succeeds but leaves a task pointing at a project that does not exist, which only
// the foreign key check after the commit can catch (foreign keys are off while migrating)
const DANGLING_SQL = `INSERT INTO tasks (id, title, project_id) VALUES ('tsk_dangling', 'Dangling', 'prj_missing');`;

describe('runMigrations — failures', () => {
  function caught(fn: () => void): WorkspaceMigrationError {
    try {
      fn();
    } catch (error) {
      expect(error).toBeInstanceOf(WorkspaceMigrationError);
      return error as WorkspaceMigrationError;
    }
    throw new Error('expected runMigrations to throw');
  }

  it('reports a failed statement as rolled back and leaves the database unchanged', () => {
    const { sqlite, db } = openDb();
    runMigrations(sqlite, db, MIGRATIONS_PATH);
    seed(sqlite);
    const before = snapshot(sqlite);
    const applied = pluckGet(sqlite, 'SELECT count(*) FROM __drizzle_migrations');

    const folder = migrationsWithExtra(path.join(tmpDir, 'broken'), '0099_broken', BROKEN_SQL);
    const error = caught(() => runMigrations(sqlite, db, folder));

    expect(error.code).toBe('workspace_migration');
    expect(error.committed).toBe(false);
    expect(error.restoredFromBackup).toBe(false);
    // drizzle's error names the statement that failed
    expect(String(error.cause)).toMatch(/INSERT INTO no_such_table/);

    // the whole transaction, including the statement that succeeded, was rolled back
    expect(snapshot(sqlite)).toEqual(before);
    expect(pluckGet(sqlite, 'SELECT count(*) FROM __drizzle_migrations')).toBe(applied);
    expect(
      sqlite.prepare(`SELECT 1 FROM sqlite_master WHERE name = 'rolled_back'`).get(),
    ).toBeUndefined();
    expect(pluckGet(sqlite, 'PRAGMA foreign_keys')).toBe(1);
    sqlite.close();
  });

  it('reports broken references found after the commit as committed', () => {
    const { sqlite, db } = openDb();
    runMigrations(sqlite, db, MIGRATIONS_PATH);

    const folder = migrationsWithExtra(
      path.join(tmpDir, 'dangling'),
      '0099_dangling',
      DANGLING_SQL,
    );
    const error = caught(() => runMigrations(sqlite, db, folder));

    expect(error.committed).toBe(true);
    expect(error.cause).toEqual([expect.objectContaining({ table: 'tasks', parent: 'projects' })]);
    expect(pluckGet(sqlite, 'PRAGMA foreign_keys')).toBe(1);
    sqlite.close();
  });
});
