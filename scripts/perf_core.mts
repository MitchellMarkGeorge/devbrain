/**
 * Times the routes each page calls against a workspace, in main's own code (the tRPC router and
 * core's services), and prints each one's query plans: `EXPLAIN QUERY PLAN` for every statement it
 * ran, with full-table scans and temporary sort trees flagged. Also times opening the workspace and
 * the writes docs/performance.md budgets. Read-only except for the writes, which it undoes.
 *
 *   npm run seed:large -- --path=.perf --reset
 *   npm run perf:core -- --path=.perf [--runs=30] [--plans] [--json=out.json]
 *
 * Runs on Electron's Node through Vite (scripts/run-with-vite.mts), like the seed.
 */

import path from 'node:path';
import fs from 'node:fs/promises';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import Database from 'better-sqlite3';
import { openDevBrain } from '@main/core';
import { openElectronSettingsStore } from '@main/runtime/settings-store';
import { devCipher } from '@main/runtime/dev-cipher';
import type { Workspace } from '@main/core/workspace/workspace';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const argv = process.argv.slice(2);
const opt = (name: string, fallback: string) =>
  argv.find((arg) => arg.startsWith(`--${name}=`))?.slice(name.length + 3) ?? fallback;
const ROOT_PATH = path.resolve(REPO_ROOT, opt('path', '.perf'));
const RUNS = Number(opt('runs', '30'));
const PLANS = argv.includes('--plans');
const JSON_OUT = opt('json', '');

interface Statement {
  sql: string;
  params: unknown[];
}

// every statement the workspace's connection runs while `capturing` is on
let capturing: Statement[] | null = null;
function captureStatements(sqlite: Database.Database) {
  const prepare = sqlite.prepare.bind(sqlite);
  sqlite.prepare = ((source: string) => {
    const statement = prepare(source);
    for (const method of ['all', 'get', 'run', 'iterate', 'raw', 'values'] as const) {
      const original = (statement as unknown as Record<string, unknown>)[method];
      if (typeof original !== 'function') continue;
      (statement as unknown as Record<string, unknown>)[method] = function (
        this: unknown,
        ...params: unknown[]
      ) {
        if (capturing && method !== 'raw') capturing.push({ sql: source, params });
        return (original as (...args: unknown[]) => unknown).apply(this, params);
      };
    }
    return statement;
  }) as typeof sqlite.prepare;
}

function plan(sqlite: Database.Database, { sql, params }: Statement): string[] {
  if (!/^\s*(SELECT|WITH|UPDATE|DELETE|INSERT)/i.test(sql)) return [];
  try {
    const rows = sqlite.prepare(`EXPLAIN QUERY PLAN ${sql}`).all(...(params as never[])) as {
      detail: string;
    }[];
    return rows.map((row) => row.detail);
  } catch (error) {
    return [`(no plan: ${(error as Error).message})`];
  }
}

// a scan of a whole table (not of an index, or of the FTS index) or a sort the indexes can't give
const flagged = (detail: string) =>
  (/^SCAN \w+$/.test(detail) && !/VIRTUAL TABLE/.test(detail)) || /TEMP B-TREE/.test(detail);

function quantile(sorted: number[], q: number) {
  return sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * q))];
}

async function time(runs: number, run: () => unknown): Promise<{ p50: number; p95: number }> {
  const times: number[] = [];
  for (let i = 0; i < runs; i++) {
    const start = performance.now();
    await run();
    times.push(performance.now() - start);
  }
  times.sort((a, b) => a - b);
  return { p50: quantile(times, 0.5), p95: quantile(times, 0.95) };
}

const results: Array<Record<string, unknown>> = [];
function report(name: string, row: Record<string, unknown>) {
  results.push({ name, ...row });
  const cells = Object.entries(row)
    .map(([key, value]) => `${key} ${typeof value === 'number' ? value.toFixed(2) : value}`)
    .join(', ');
  console.log(`${name}: ${cells}`);
}

async function main() {
  const devBrain = await openDevBrain({
    settingsStore: openElectronSettingsStore,
    path: ROOT_PATH,
    createIfMissing: false,
    workspace: {
      migrationsPath: path.join(REPO_ROOT, 'src/main/db/migrations'),
      cipher: devCipher,
      fetch,
    },
  });
  const infos = devBrain.workspaces.listAll({ limit: 100 }).items;
  // the largest workspace in the folder: the one seed:large made
  const sizes = await Promise.all(
    infos.map(async (info) => (await fs.stat(path.join(info.path, 'db.sqlite'))).size),
  );
  const info = infos[sizes.indexOf(Math.max(...sizes))];
  const dbPath = path.join(info.path, 'db.sqlite');
  console.log(`Workspace ${info.name} (${info.id}), ${(Math.max(...sizes) / 1e6).toFixed(1)} MB`);

  // opening: what workspaces.open costs, and the part of it that copies the database
  // open alone: closing waits for anything open left running
  const opens: number[] = [];
  for (let i = 0; i < 3; i++) {
    const start = performance.now();
    await devBrain.workspaces.open(info.id);
    opens.push(performance.now() - start);
    await devBrain.workspaces.close();
  }
  opens.sort((a, b) => a - b);
  report('workspaces.open', { p50: quantile(opens, 0.5), p95: quantile(opens, 0.95) });
  const backupPath = path.join(os.tmpdir(), `devbrain-perf-${process.pid}.sqlite`);
  const backup = await time(3, async () => {
    const sqlite = new Database(dbPath, { readonly: true });
    await sqlite.backup(backupPath);
    sqlite.close();
  });
  await fs.rm(backupPath, { force: true });
  report('  of which a copy of the database (sqlite.backup)', backup);

  const workspace: Workspace = await devBrain.workspaces.open(info.id);
  const sqlite = (workspace as unknown as { sqliteClient: Database.Database }).sqliteClient;
  captureStatements(sqlite);
  // what each route's handler calls (src/main/ipc/routers), with the inputs the pages send
  const w = workspace;

  const one = <T,>(rows: T[]) => rows[0];
  const ids = {
    project: one(
      sqlite
        .prepare(
          `SELECT project_id AS id FROM tasks WHERE archived_at IS NULL AND project_id IS NOT NULL
           GROUP BY project_id ORDER BY count(*) DESC LIMIT 1`,
        )
        .all() as { id: string }[],
    ).id,
    note: one(
      sqlite.prepare(`SELECT id FROM notes WHERE title LIKE 'Engineering handbook%'`).all() as {
        id: string;
      }[],
    )?.id,
    tasks: (
      sqlite
        .prepare(
          `SELECT id FROM tasks WHERE archived_at IS NULL AND parent_task_id IS NULL ORDER BY id LIMIT 200`,
        )
        .all() as { id: string }[]
    ).map((row) => row.id),
  };
  const now = new Date();
  const day = (offset: number) => {
    const date = new Date(now);
    date.setHours(0, 0, 0, 0);
    date.setDate(date.getDate() + offset);
    return date;
  };

  // [name, call]: the inputs the pages send (captured from the app with the perf harness)
  type Call = () => Promise<unknown>;
  const reads: Array<[string, Call]> = [
    [
      'tasks.list: Tasks, by priority, 100',
      async () => w.tasks.listTasks({}, { sortBy: 'priority', direction: 'desc' }, { limit: 100 }),
    ],
    [
      'tasks.list: open, by due date, 100',
      async () =>
        w.tasks.listTasks(
          { excludeClosed: true },
          { sortBy: 'dueDate', direction: 'asc' },
          { limit: 100 },
        ),
    ],
    [
      'tasks.list: a board column (status 2), 100',
      async () =>
        w.tasks.listTasks(
          { excludeSubtasks: true, status: 2 },
          { sortBy: 'priority', direction: 'desc' },
          { limit: 100 },
        ),
    ],
    [
      'tasks.list: a project group, 100',
      async () =>
        w.tasks.listTasks(
          { projectId: ids.project as never },
          { sortBy: 'priority', direction: 'desc' },
          { limit: 100 },
        ),
    ],
    [
      'tasks.list: Home, due today, 100',
      async () =>
        w.tasks.listTasks(
          { dueBefore: day(1), excludeClosed: true },
          { sortBy: 'dueDate', direction: 'asc' },
          { limit: 100 },
        ),
    ],
    [
      "tasks.list: a note's tasks",
      async () =>
        w.tasks.listTasks(
          { noteId: ids.note as never },
          { sortBy: 'createdAt', direction: 'asc' },
          { limit: 100 },
        ),
    ],
    ['tasks.get', async () => w.tasks.getById(ids.tasks[0] as never, { includeArchived: true })],
    ['tasks.subtasks', async () => w.tasks.listSubtasks(ids.tasks[0] as never, { limit: 100 })],
    [
      'projects.list: 200, open (sidebar menus, group view)',
      async () => w.projects.listProjects({ excludeCompleted: true }, undefined, { limit: 200 }),
    ],
    [
      'projects.list: Projects, active, by due date',
      async () =>
        w.projects.listProjects(
          { status: 3 },
          { sortBy: 'dueDate', direction: 'asc' },
          { limit: 100 },
        ),
    ],
    [
      'notes.list: Notes, last edited, 100',
      async () => w.notes.listNotes({}, { sortBy: 'updatedAt', direction: 'desc' }, { limit: 100 }),
    ],
    [
      'notes.readContent: the 200 KB note',
      () => w.notes.readContent(ids.note as never, { includeArchived: true }),
    ],
    ['events.listForCalendar: a week', () => w.events.listForCalendar(day(-7), day(0))],
    [
      'events.listForCalendar: a month grid (6 weeks)',
      () => w.events.listForCalendar(day(-21), day(21)),
    ],
    [
      'search.search: "design system"',
      async () => w.search.search({ query: 'design system', entityType: [], limit: 50 }),
    ],
    ['search.search: "d"', async () => w.search.search({ query: 'd', entityType: [], limit: 50 })],
    ['search.counts: "design"', async () => w.search.counts('design')],
    ['recents.list 5', async () => w.recents.listRecents({}, { limit: 5 })],
    ['favorites.list 5', async () => w.favorites.listFavorites({}, { limit: 5 })],
    [
      'archive.listArchived 50',
      async () => w.archive.listArchived({ entityType: 'all' }, { limit: 50 }),
    ],
  ];

  for (const [name, call] of reads) {
    capturing = [];
    let bytes = 0;
    try {
      bytes = JSON.stringify(await call()).length;
    } catch (error) {
      report(name, { failed: `${(error as Error).message}` as never });
      capturing = null;
      continue;
    }
    const statements = capturing;
    capturing = null;
    const timing = await time(RUNS, call);
    const plans = statements.map((statement) => plan(sqlite, statement));
    const flags = [...new Set(plans.flat().filter(flagged))];
    report(name, {
      ...timing,
      kb: bytes / 1024,
      statements: statements.length,
      flags: flags.join('; ') || '-',
    } as never);
    if (PLANS) {
      statements.forEach((statement, i) => {
        console.log(`    ${statement.sql.replace(/\s+/g, ' ').slice(0, 220)}`);
        for (const detail of plans[i])
          console.log(`      ${flagged(detail) ? '!' : ' '} ${detail}`);
      });
    }
  }

  // writes, each undone: the bulk status the selection bar sends, and a single status change
  const before = sqlite
    .prepare(
      `SELECT id, status, completed_at FROM tasks WHERE id IN (${ids.tasks.map(() => '?').join(',')})`,
    )
    .all(...ids.tasks) as { id: string; status: number; completed_at: number | null }[];
  const bulk = await time(3, async () => {
    w.tasks.updateTasks(ids.tasks as never, { status: 2 });
  });
  report('tasks.updateMany: status of 200 tasks', bulk);
  const single = await time(RUNS, async () => {
    w.tasks.updateStatus(ids.tasks[0] as never, 3);
    w.tasks.updateStatus(ids.tasks[0] as never, 2);
  });
  report('tasks.updateStatus (x2)', single);
  // put the rows back as they were (the search entries the writes replaced hold the same text)
  const restore = sqlite.prepare(`UPDATE tasks SET status = ?, completed_at = ? WHERE id = ?`);
  sqlite.transaction(() => {
    for (const row of before) restore.run(row.status, row.completed_at, row.id);
  })();

  await devBrain.close();
  if (JSON_OUT) await fs.writeFile(JSON_OUT, JSON.stringify(results, null, 1));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
