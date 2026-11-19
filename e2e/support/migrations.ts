import fs from 'node:fs';
import path from 'node:path';
import { MIGRATIONS_PATH } from './paths';
import { readJson } from './folder';

interface JournalEntry {
  idx: number;
  version: string;
  when: number;
  tag: string;
  breakpoints: boolean;
}

/** The app's migrations, as its journal lists them. */
export function journalEntries(): JournalEntry[] {
  return readJson<{ entries: JournalEntry[] }>(path.join(MIGRATIONS_PATH, 'meta/_journal.json'))
    .entries;
}

/**
 * A copy of the app's migrations at `dir`, with one more after the latest: `sql` under `tag`, as
 * core's tests make them (src/main/core/tests/utils.ts, migrationsWithExtra). Pass it as the
 * launch's `migrationsPath` to open workspaces with it.
 */
export function migrationsWithExtra(dir: string, tag: string, sql: string): string {
  fs.cpSync(MIGRATIONS_PATH, dir, { recursive: true });
  const journalPath = path.join(dir, 'meta/_journal.json');
  const journal = readJson<{ entries: JournalEntry[] }>(journalPath);
  const last = journal.entries[journal.entries.length - 1];
  journal.entries.push({ ...last, idx: last.idx + 1, when: last.when + 1, tag });
  fs.writeFileSync(journalPath, JSON.stringify(journal));
  fs.writeFileSync(path.join(dir, `${tag}.sql`), sql);
  return dir;
}
