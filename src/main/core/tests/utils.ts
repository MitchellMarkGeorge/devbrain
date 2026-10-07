import Database from 'better-sqlite3';
import { BetterSQLite3Database, drizzle } from 'drizzle-orm/better-sqlite3';
import { runMigrations } from '@main/db/migrate';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const MIGRATIONS_PATH = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../../db/migrations',
);

export function createDb(): BetterSQLite3Database {
  const sqlite = new Database(':memory:');
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
