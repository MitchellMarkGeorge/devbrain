import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import { runMigrations } from '@main/db/migrate';
import { WorkspaceMigrationError } from '@main/core/shared/errors';
import { migrationsWithExtra } from '../utils';
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
  const sqlite = new Database(':memory:');
  sqlite.pragma('foreign_keys = ON');
  return { sqlite, db: drizzle({ client: sqlite, casing: 'snake_case' }) };
}

function seed(sqlite: Database.Database) {
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

function snapshot(sqlite: Database.Database) {
  return Object.fromEntries(
    TABLES.map((t) => [t, sqlite.prepare(`SELECT * FROM ${t} ORDER BY id`).all()]),
  );
}

function schemaObjects(sqlite: Database.Database, type: 'index' | 'trigger') {
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

function checkConstraints(sqlite: Database.Database, table: string): string[] {
  const { sql } = sqlite
    .prepare(`SELECT sql FROM sqlite_master WHERE type = 'table' AND name = ?`)
    .get(table) as { sql: string };
  return [...sql.matchAll(/CONSTRAINT "(\w+)" CHECK/g)].map((m) => m[1]);
}

function columnNotNull(sqlite: Database.Database, table: string, column: string): boolean {
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

    runMigrations(sqlite, db, MIGRATIONS_PATH);

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
    expect(sqlite.prepare('PRAGMA integrity_check').pluck().get()).toBe('ok');

    expect(columnNotNull(sqlite, 'tasks', 'due_date')).toBe(false);
    expect(columnNotNull(sqlite, 'projects', 'due_date')).toBe(false);
    sqlite.close();
  });

  it('keeps foreign keys enforced and accepts null due dates afterwards', () => {
    const { sqlite, db } = openDb();
    runMigrations(sqlite, db, MIGRATIONS_PATH);
    expect(sqlite.pragma('foreign_keys', { simple: true })).toBe(1);

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
    const applied = sqlite.prepare('SELECT count(*) FROM __drizzle_migrations').pluck().get();

    const folder = migrationsWithExtra(path.join(tmpDir, 'broken'), '0099_broken', BROKEN_SQL);
    const error = caught(() => runMigrations(sqlite, db, folder));

    expect(error.code).toBe('workspace_migration');
    expect(error.committed).toBe(false);
    expect(error.restoredFromBackup).toBe(false);
    // drizzle's error names the statement that failed
    expect(String(error.cause)).toMatch(/INSERT INTO no_such_table/);

    // the whole transaction, including the statement that succeeded, was rolled back
    expect(snapshot(sqlite)).toEqual(before);
    expect(sqlite.prepare('SELECT count(*) FROM __drizzle_migrations').pluck().get()).toBe(applied);
    expect(
      sqlite.prepare(`SELECT 1 FROM sqlite_master WHERE name = 'rolled_back'`).get(),
    ).toBeUndefined();
    expect(sqlite.pragma('foreign_keys', { simple: true })).toBe(1);
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
    expect(sqlite.pragma('foreign_keys', { simple: true })).toBe(1);
    sqlite.close();
  });
});
