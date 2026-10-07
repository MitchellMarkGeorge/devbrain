import type Database from 'better-sqlite3';
import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import fs from 'node:fs';
import path from 'node:path';
import { WorkspaceMigrationError } from '@main/core/shared/errors';

interface Journal {
  entries: { tag: string; when: number }[];
}

/**
 * Tags of the migrations drizzle will apply: those newer than the last one recorded in
 * `__drizzle_migrations`, which is how drizzle itself decides.
 */
function pendingMigrations(sqlite: Database.Database, migrationsFolder: string): string[] {
  const journalPath = path.join(migrationsFolder, 'meta/_journal.json');
  const journal = JSON.parse(fs.readFileSync(journalPath, 'utf8')) as Journal;
  const hasTable = sqlite
    .prepare(`SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = '__drizzle_migrations'`)
    .get();
  const last = hasTable
    ? (sqlite.prepare('SELECT max(created_at) FROM __drizzle_migrations').pluck().get() as
        | number
        | null)
    : null;
  return journal.entries.filter((e) => last === null || e.when > Number(last)).map((e) => e.tag);
}

/**
 * Runs pending migrations with foreign keys switched off, then checks them before turning them
 * back on.
 *
 * Drizzle applies migrations inside one transaction, where `PRAGMA foreign_keys` is a no-op, so the
 * `PRAGMA foreign_keys=OFF` that drizzle-kit emits around a table rebuild does nothing. With foreign
 * keys on, the rebuild's `DROP TABLE` runs an implicit DELETE that fires every ON DELETE action:
 * subtasks cascade away and project and note links are set to null. Switching foreign keys off out
 * here, before the transaction starts, is the procedure SQLite documents for table rebuilds.
 *
 * Throws WorkspaceMigrationError. When a statement fails, drizzle rolls the transaction back and
 * the database is unchanged (`committed: false`). The foreign key check can only run after the
 * commit, so when it fails the database has changed (`committed: true`) and the caller should
 * restore a backup.
 */
export function runMigrations(
  sqlite: Database.Database,
  db: BetterSQLite3Database,
  migrationsFolder: string,
): void {
  const pending = pendingMigrations(sqlite, migrationsFolder);
  const details = { pendingMigrations: pending, restoredFromBackup: false, backupPath: null };

  sqlite.pragma('foreign_keys = OFF');
  try {
    try {
      migrate(db, { migrationsFolder });
    } catch (cause) {
      throw new WorkspaceMigrationError(
        'The workspace database could not be updated; no changes were made',
        { ...details, committed: false, cause },
      );
    }
    const violations = sqlite.pragma('foreign_key_check') as unknown[];
    if (violations.length > 0) {
      throw new WorkspaceMigrationError(
        `The workspace database update left ${violations.length} broken reference(s)`,
        { ...details, committed: true, cause: violations },
      );
    }
  } finally {
    sqlite.pragma('foreign_keys = ON');
  }
}
