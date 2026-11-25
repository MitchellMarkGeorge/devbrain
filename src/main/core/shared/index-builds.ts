import { eq } from 'drizzle-orm';
import { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import { indexBuilds, type IndexName } from '@main/db/schema/index-builds';

// Whether an index derived from the workspace's content (search, mentions) has been built from
// everything in it, as `index_builds` records. Saves keep a built index in step; one that isn't
// built is missing what was there before it existed, or before a migration that changed it
// deleted its row.

export function isIndexBuilt(db: BetterSQLite3Database, name: IndexName): boolean {
  return (
    db.select({ name: indexBuilds.name }).from(indexBuilds).where(eq(indexBuilds.name, name)).all()
      .length > 0
  );
}

/** records that `name` was just built; called in the transaction that wrote what it built */
export function markIndexBuilt(db: BetterSQLite3Database, name: IndexName): void {
  const builtAt = new Date();
  db.insert(indexBuilds)
    .values({ name, builtAt })
    .onConflictDoUpdate({ target: indexBuilds.name, set: { builtAt } })
    .run();
}
