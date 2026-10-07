import Database from 'better-sqlite3';
import { BetterSQLite3Database, drizzle } from 'drizzle-orm/better-sqlite3';
import { runMigrations } from '@main/db/migrate';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const MIGRATIONS_PATH = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../../db/migrations',
);

export function createDb(): BetterSQLite3Database {
  const sqlite = new Database(':memory:');
  const db = drizzle({ client: sqlite, casing: 'snake_case' });
  runMigrations(sqlite, db, MIGRATIONS_PATH);
  return db;
}
