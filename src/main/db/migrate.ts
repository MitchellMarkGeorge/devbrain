import type Database from 'better-sqlite3';
import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import { readMigrationFiles } from 'drizzle-orm/migrator';
import { WorkspaceMigrationError, WorkspaceTooNewError } from '@main/core/shared/errors';

// where drizzle records the migrations it has applied, one row each, `created_at` being the
// migration's journal time
const MIGRATIONS_TABLE = '__drizzle_migrations';

/**
 * Throws WorkspaceTooNewError when the database has a migration newer than every one in
 * `migrationsFolder`: a newer DevBrain migrated it. Drizzle would apply nothing and open it as if
 * it were current, and this app's queries could then break it. A database with no migrations
 * table yet (a new one) passes.
 */
export function assertNotNewerThanApp(sqlite: Database.Database, migrationsFolder: string): void {
  if (!hasMigrationsTable(sqlite)) return;
  const row = sqlite
    .prepare(`SELECT MAX(created_at) AS latest FROM "${MIGRATIONS_TABLE}"`)
    .get() as { latest: number | string | null };
  if (row.latest === null) return;
  const known = readMigrationFiles({ migrationsFolder });
  const appLatest = Math.max(0, ...known.map((migration) => migration.folderMillis));
  if (Number(row.latest) > appLatest) throw new WorkspaceTooNewError();
}

// whether the database holds drizzle's migrations table, as every workspace database does
export function hasMigrationsTable(sqlite: Database.Database): boolean {
  return (
    sqlite
      .prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?")
      .get(MIGRATIONS_TABLE) !== undefined
  );
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
 * Throws WorkspaceTooNewError, before changing anything, for a database a newer DevBrain migrated
 * (see assertNotNewerThanApp), and WorkspaceMigrationError. When a statement fails, drizzle rolls the transaction back and
 * the database is unchanged (`committed: false`). The foreign key check can only run after the
 * commit, so when it fails the database has changed (`committed: true`) and the caller should
 * restore a backup.
 */
export function runMigrations(
  sqlite: Database.Database,
  db: BetterSQLite3Database,
  migrationsFolder: string,
): void {
  const details = { restoredFromBackup: false, backupPath: null };
  assertNotNewerThanApp(sqlite, migrationsFolder);

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
