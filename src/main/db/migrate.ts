import type { DatabaseSync } from 'node:sqlite';
import { migrate, type NodeSQLiteDatabase } from '@main/db/node-sqlite';
import { WorkspaceMigrationError } from '@main/core/shared/errors';

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
  sqlite: DatabaseSync,
  db: NodeSQLiteDatabase,
  migrationsFolder: string,
): void {
  const details = { restoredFromBackup: false, backupPath: null };

  sqlite.exec('PRAGMA foreign_keys = OFF');
  try {
    try {
      migrate(db, { migrationsFolder });
    } catch (cause) {
      throw new WorkspaceMigrationError(
        'The workspace database could not be updated; no changes were made',
        { ...details, committed: false, cause },
      );
    }
    const violations = sqlite.prepare('PRAGMA foreign_key_check').all();
    if (violations.length > 0) {
      throw new WorkspaceMigrationError(
        `The workspace database update left ${violations.length} broken reference(s)`,
        { ...details, committed: true, cause: violations },
      );
    }
  } finally {
    sqlite.exec('PRAGMA foreign_keys = ON');
  }
}
