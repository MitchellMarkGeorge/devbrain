/**
 * Builds a DevBrain folder as an earlier version of the app left it, from a fixture in
 * e2e/upgrade/fixtures (docs/testing.md, "Upgrade fixtures"):
 *
 *   npm run e2e:fixture -- <fixture> <out-dir>
 *
 * A fixture is a folder laid out as the DevBrain folder was then (settings.json, workspaces.json,
 * workspaces/<id>/…), plus:
 *
 * - `fixture.json`: `migration`, the index of the last migration that version shipped, and
 *   optionally `newerMigration`, a migration a newer DevBrain recorded (for the too-new test);
 * - `workspaces/<id>/db.sql`: the rows, in the schema of that migration. Each becomes the
 *   workspace's `db.sqlite`: drizzle's migrator (as the app runs it) applies the migration set as
 *   it was at `migration` (this repository's, its journal cut there: a merged migration never
 *   changes), then the SQL runs.
 *
 * `${DEVBRAIN}` in any JSON, Markdown or SQL file is replaced with the folder's absolute path, as
 * that version wrote it (workspaces.json's paths, settings.json's devBrainPath, notes' file_path).
 *
 * Runs on Electron's Node (run-with-vite), where better-sqlite3 is built.
 */
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const MIGRATIONS_PATH = path.join(REPO_ROOT, 'src/main/db/migrations');
const FIXTURES_PATH = path.join(REPO_ROOT, 'e2e/upgrade/fixtures');
const PLACEHOLDER = '${DEVBRAIN}';

interface FixtureJson {
  // the last migration (its journal idx) of the version that wrote the folder
  migration: number;
  // a migration only a newer DevBrain has, recorded in every database as applied
  newerMigration?: string;
}

interface Journal {
  entries: { idx: number; when: number; tag: string }[];
}

const [fixtureName, outArg] = process.argv.slice(2);
if (fixtureName === undefined || outArg === undefined) {
  console.error('Usage: build_upgrade_fixtures.mts <fixture> <out-dir>');
  process.exit(1);
}
const fixtureDir = path.join(FIXTURES_PATH, fixtureName);
const outDir = path.resolve(outArg);
const fixture = JSON.parse(
  fs.readFileSync(path.join(fixtureDir, 'fixture.json'), 'utf8'),
) as FixtureJson;

const journal = JSON.parse(
  fs.readFileSync(path.join(MIGRATIONS_PATH, 'meta/_journal.json'), 'utf8'),
) as Journal;
if (!journal.entries.some((entry) => entry.idx === fixture.migration)) {
  throw new Error(`${fixtureName}: no migration ${fixture.migration} in ${MIGRATIONS_PATH}`);
}

const scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'devbrain-fixture-migrations-'));
try {
  const migrations = migrationsUpTo(fixture.migration, scratch);
  fs.mkdirSync(outDir, { recursive: true });
  copyTree(fixtureDir, outDir, migrations);
} finally {
  fs.rmSync(scratch, { recursive: true, force: true });
}

/** A copy of the migrations folder that stops at (and includes) `lastIdx`. */
function migrationsUpTo(lastIdx: number, dir: string): string {
  fs.cpSync(MIGRATIONS_PATH, dir, { recursive: true });
  for (const entry of journal.entries.filter((e) => e.idx > lastIdx)) {
    fs.rmSync(path.join(dir, `${entry.tag}.sql`));
  }
  const cut: Journal = { ...journal, entries: journal.entries.filter((e) => e.idx <= lastIdx) };
  fs.writeFileSync(path.join(dir, 'meta/_journal.json'), JSON.stringify(cut));
  return dir;
}

function copyTree(from: string, to: string, migrations: string): void {
  for (const entry of fs.readdirSync(from, { withFileTypes: true })) {
    const source = path.join(from, entry.name);
    const target = path.join(to, entry.name);
    if (entry.isDirectory()) {
      fs.mkdirSync(target, { recursive: true });
      copyTree(source, target, migrations);
    } else if (from === fixtureDir && entry.name === 'fixture.json') {
      continue;
    } else if (entry.name === 'db.sql') {
      const rows = substitute(fs.readFileSync(source, 'utf8'));
      buildDatabase(path.join(to, 'db.sqlite'), rows, migrations);
      // every workspace has its notes folder, notes or not (git keeps no empty folder)
      fs.mkdirSync(path.join(to, 'notes'), { recursive: true });
    } else if (/\.(json|md)$/.test(entry.name)) {
      fs.writeFileSync(target, substitute(fs.readFileSync(source, 'utf8')));
    } else {
      fs.copyFileSync(source, target);
    }
  }
}

function substitute(text: string): string {
  return text.split(PLACEHOLDER).join(outDir);
}

function buildDatabase(dbPath: string, rows: string, migrations: string): void {
  fs.rmSync(dbPath, { force: true });
  const sqlite = new Database(dbPath);
  try {
    // as the app opened workspaces then: WAL, migrations, then its writes with foreign keys on
    sqlite.pragma('journal_mode = WAL');
    migrate(drizzle({ client: sqlite }), { migrationsFolder: migrations });
    sqlite.pragma('foreign_keys = ON');
    sqlite.transaction(() => sqlite.exec(rows))();
    const violations = sqlite.pragma('foreign_key_check') as unknown[];
    if (violations.length > 0) {
      throw new Error(`${dbPath}: the fixture's rows break ${violations.length} reference(s)`);
    }
    if (fixture.newerMigration !== undefined) recordNewerMigration(sqlite, fixture.newerMigration);
    // fold the WAL into the file, as closing does, so the fixture is one file
    sqlite.pragma('wal_checkpoint(TRUNCATE)');
  } finally {
    sqlite.close();
  }
}

/**
 * Records a migration this app doesn't have, a day after its latest, as a newer DevBrain that
 * ran it would have: drizzle keeps the hash of its SQL and its journal time.
 */
function recordNewerMigration(sqlite: Database.Database, tag: string): void {
  const latest = Math.max(...journal.entries.map((entry) => entry.when));
  const hash = crypto.createHash('sha256').update(`-- ${tag}\n`).digest('hex');
  sqlite
    .prepare('INSERT INTO "__drizzle_migrations" ("hash", "created_at") VALUES (?, ?)')
    .run(hash, latest + 86_400_000);
}
