import type Database from 'better-sqlite3';
import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';

/**
 * Runs pending migrations with foreign keys switched off, then checks them before turning them
 * back on.
 *
 * Drizzle applies migrations inside one transaction, where `PRAGMA foreign_keys` is a no-op, so the
 * `PRAGMA foreign_keys=OFF` that drizzle-kit emits around a table rebuild does nothing. With foreign
 * keys on, the rebuild's `DROP TABLE` runs an implicit DELETE that fires every ON DELETE action:
 * subtasks cascade away and project and note links are set to null. Switching foreign keys off out
 * here, before the transaction starts, is the procedure SQLite documents for table rebuilds.
 */
export function runMigrations(
  sqlite: Database.Database,
  db: BetterSQLite3Database,
  migrationsFolder: string,
): void {
  sqlite.pragma('foreign_keys = OFF');
  try {
    migrate(db, { migrationsFolder });
    const violations = sqlite.pragma('foreign_key_check') as unknown[];
    if (violations.length > 0) {
      throw new Error(
        `Migration left ${violations.length} foreign key violation(s): ${JSON.stringify(violations)}`,
      );
    }
  } finally {
    sqlite.pragma('foreign_keys = ON');
  }
}
