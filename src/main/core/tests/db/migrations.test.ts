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

const INTEGRATION_TABLES = ['integrations', 'external_sources', 'external_links'] as const;

function tableNames(sqlite: Database.Database): string[] {
  return sqlite
    .prepare(`SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name`)
    .pluck()
    .all() as string[];
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
    expect(sqlite.prepare('PRAGMA integrity_check').pluck().get()).toBe('ok');
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

    // up to 0017 only: later migrations change existing rows on purpose (0019 rebuilds events)
    runMigrations(sqlite, db, migrationsUpTo(17));

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
    expect(sqlite.prepare(`SELECT source_id FROM external_links`).pluck().all()).toEqual([null]);
    sqlite.close();
  });
});

describe('migration 0018 — source retryAt', () => {
  it('adds a null retry_at to existing sources and keeps their sync state', () => {
    const { sqlite, db } = openDb();
    migrate(db, { migrationsFolder: migrationsUpTo(17) });
    sqlite.exec(`
      INSERT INTO integrations (id, provider, auth_type, account_id, account_label, credentials)
        VALUES ('int_a', 'linear', 'api_key', 'org:user', 'Ada', x'00');
      INSERT INTO external_sources (id, integration_id, source_type, cursor, consecutive_failures)
        VALUES ('src_a', 'int_a', 'tasks', '{"mode":"incremental","updatedSince":"2026-10-01T00:00:00.000Z"}', 2);
    `);

    runMigrations(sqlite, db, MIGRATIONS_PATH);

    expect(
      sqlite
        .prepare(`SELECT id, cursor, consecutive_failures, retry_at FROM external_sources`)
        .all(),
    ).toEqual([
      {
        id: 'src_a',
        cursor: '{"mode":"incremental","updatedSince":"2026-10-01T00:00:00.000Z"}',
        consecutive_failures: 2,
        retry_at: null,
      },
    ]);
    expect(sqlite.prepare('PRAGMA integrity_check').pluck().get()).toBe('ok');
    sqlite.close();
  });
});

describe('migration 0019 — event exceptions', () => {
  it('adds the table, keyed by source, master and original start, going with its source', () => {
    const { sqlite, db } = openDb();
    migrate(db, { migrationsFolder: migrationsUpTo(18) });
    sqlite.exec(`
      INSERT INTO integrations (id, provider, auth_type, account_id, account_label, credentials)
        VALUES ('int_a', 'google_calendar', 'oauth', 'ada@example.com', 'ada@example.com', x'00');
      INSERT INTO external_sources (id, integration_id, source_type) VALUES ('src_a', 'int_a', 'events');
    `);

    runMigrations(sqlite, db, MIGRATIONS_PATH);

    const insert = sqlite.prepare(
      `INSERT INTO external_event_exceptions (source_id, calendar_id, master_external_id, original_start_at)
        VALUES ('src_a', 'cal', 'cal:series', ?)`,
    );
    insert.run(1000);
    insert.run(2000);
    expect(() => insert.run(1000)).toThrow(/UNIQUE/);
    sqlite.exec(`DELETE FROM external_sources WHERE id = 'src_a'`);
    expect(sqlite.prepare(`SELECT count(*) FROM external_event_exceptions`).pluck().get()).toBe(0);
    expect(sqlite.prepare('PRAGMA integrity_check').pluck().get()).toBe('ok');
    sqlite.close();
  });
});

describe('migration 0019 — calendars and the event model', () => {
  function migrated(seedEvents: string) {
    const { sqlite, db } = openDb();
    migrate(db, { migrationsFolder: migrationsUpTo(18) });
    sqlite.exec(seedEvents);
    runMigrations(sqlite, db, MIGRATIONS_PATH);
    return sqlite;
  }

  it('seeds the default calendar and moves every event into it, keeping each row', () => {
    const sqlite = migrated(`
      INSERT INTO events (id, title, start_at, end_at, reccurrence_rule, color, created_at)
        VALUES ('evt_a', 'Standup', 1000, 2000, 'RRULE:FREQ=DAILY', '#fff', 5000);
    `);

    expect(
      sqlite.prepare(`SELECT id, name, source_id, selected, visible FROM calendars`).all(),
    ).toEqual([{ id: 'cal_default', name: 'DevBrain', source_id: null, selected: 1, visible: 1 }]);
    expect(
      sqlite
        .prepare(
          `SELECT id, calendar_id, title, start_at, end_at, all_day, start_date, end_date,
             recurrence_rule, status, kind, color, created_at FROM events`,
        )
        .all(),
    ).toEqual([
      {
        id: 'evt_a',
        calendar_id: 'cal_default',
        title: 'Standup',
        start_at: 1000,
        end_at: 2000,
        all_day: 0,
        start_date: null,
        end_date: null,
        recurrence_rule: 'RRULE:FREQ=DAILY',
        status: 'confirmed',
        kind: 'default',
        color: '#fff',
        created_at: 5000,
      },
    ]);
    expect(sqlite.prepare('PRAGMA foreign_key_check').all()).toEqual([]);
    expect(sqlite.prepare('PRAGMA integrity_check').pluck().get()).toBe('ok');
    sqlite.close();
  });

  it('gives an all-day event its dates and moves its instants to their local midnights', () => {
    // as the seed script stores them: local midnight to 23:59 the same day, and a two-day event
    // ending exactly at midnight
    const day = new Date(2026, 9, 14).getTime();
    const sqlite = migrated(`
      INSERT INTO events (id, title, start_at, end_at, all_day) VALUES
        ('evt_one', 'Offsite', ${day}, ${day + 24 * 3600 * 1000 - 60 * 1000}, 1),
        ('evt_two', 'Conference', ${day}, ${new Date(2026, 9, 16).getTime()}, 1);
    `);

    expect(
      sqlite
        .prepare(`SELECT id, start_date, end_date, start_at, end_at FROM events ORDER BY id`)
        .all(),
    ).toEqual([
      {
        id: 'evt_one',
        start_date: '2026-10-14',
        end_date: '2026-10-15',
        start_at: day,
        end_at: new Date(2026, 9, 15).getTime(),
      },
      {
        id: 'evt_two',
        start_date: '2026-10-14',
        end_date: '2026-10-16',
        start_at: day,
        end_at: new Date(2026, 9, 16).getTime(),
      },
    ]);
    sqlite.close();
  });

  it("enforces the all-day dates and an occurrence's original start", () => {
    const sqlite = migrated('');
    expect(() =>
      sqlite.exec(
        `INSERT INTO events (id, title, start_at, end_at, all_day) VALUES ('evt_x', 'x', 0, 1, 1)`,
      ),
    ).toThrow(/all_day_dates/);
    expect(() =>
      sqlite.exec(
        `INSERT INTO events (id, title, start_at, end_at, start_date, end_date) VALUES ('evt_x', 'x', 0, 1, '2026-10-14', '2026-10-15')`,
      ),
    ).toThrow(/all_day_dates/);
    sqlite.exec(
      `INSERT INTO events (id, title, start_at, end_at) VALUES ('evt_series', 's', 0, 1)`,
    );
    expect(() =>
      sqlite.exec(
        `INSERT INTO events (id, title, start_at, end_at, series_id) VALUES ('evt_x', 'x', 0, 1, 'evt_series')`,
      ),
    ).toThrow(/series_original_start/);
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
