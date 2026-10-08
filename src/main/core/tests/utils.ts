import { DatabaseSync, type SQLInputValue } from 'node:sqlite';
import { NodeSQLiteDatabase, drizzle } from '@main/db/node-sqlite';
import { runMigrations } from '@main/db/migrate';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const MIGRATIONS_PATH = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../../db/migrations',
);

export function createDb(): NodeSQLiteDatabase {
  const sqlite = new DatabaseSync(':memory:');
  const db = drizzle({ client: sqlite, casing: 'snake_case' });
  runMigrations(sqlite, db, MIGRATIONS_PATH);
  return db;
}

/**
 * A copy of the real migrations folder in `dir` with one more migration, `tag`, applied after the
 * latest one. Statements in `sql` are separated by drizzle's `--> statement-breakpoint`.
 */
export function migrationsWithExtra(dir: string, tag: string, sql: string): string {
  fs.cpSync(MIGRATIONS_PATH, dir, { recursive: true });
  const journalPath = path.join(dir, 'meta/_journal.json');
  const journal = JSON.parse(fs.readFileSync(journalPath, 'utf8')) as {
    entries: { idx: number; version: string; when: number; tag: string; breakpoints: boolean }[];
  };
  const last = journal.entries[journal.entries.length - 1];
  journal.entries.push({ ...last, idx: last.idx + 1, when: last.when + 1, tag });
  fs.writeFileSync(journalPath, JSON.stringify(journal));
  fs.writeFileSync(path.join(dir, `${tag}.sql`), sql);
  return dir;
}

/** the first column of every row; node:sqlite has no `.pluck()` */
export function pluckAll(
  sqlite: DatabaseSync,
  query: string,
  ...params: SQLInputValue[]
): unknown[] {
  const stmt = sqlite.prepare(query);
  stmt.setReturnArrays(true);
  return (stmt.all(...params) as unknown as unknown[][]).map((row) => row[0]);
}

/** the first column of the first row, or undefined when there is no row */
export function pluckGet(sqlite: DatabaseSync, query: string, ...params: SQLInputValue[]): unknown {
  return pluckAll(sqlite, query, ...params)[0];
}
