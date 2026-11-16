import { and, eq, sql } from 'drizzle-orm';
import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import type { SearchEntityType } from '@common/types';
import { searchIndex } from './search-index';
import { toFtsQuery } from './utils';

/**
 * The index entries of one type matching `query`, as a subquery an entity's service joins to its
 * table to search its own rows: `entityId`, and `rank` (lower is better, as search() ranks). So
 * `tasks.search` returns tasks, filtered as `tasks.list` filters them, rather than search results
 * carrying what each type needs. Null when the query holds nothing searchable. Order by
 * `BEST_MATCH_FIRST`.
 *
 *   const matches = searchMatches(db, query, 'task');
 *   if (!matches) return [];
 *   db.select(getTableColumns(tasks)).from(tasks)
 *     .innerJoin(matches, eq(matches.entityId, tasks.id))
 *     .where(and(...clauses)).orderBy(BEST_MATCH_FIRST).limit(limit).all();
 */
export function searchMatches(
  db: BetterSQLite3Database,
  query: string,
  entityType: SearchEntityType,
) {
  const ftsQuery = toFtsQuery(query);
  if (!ftsQuery) return null;
  return db
    .select({
      entityId: searchIndex.entityId,
      // named apart from the joined table's columns: Drizzle refers to it unqualified
      rank: sql<number>`bm25(${searchIndex}, 10.0, 1.0)`.as('match_rank'),
    })
    .from(searchIndex)
    .where(and(sql`${searchIndex} MATCH ${ftsQuery}`, eq(searchIndex.entityType, entityType)))
    .as('matches');
}

/** Orders a query joined to `searchMatches` best match first. */
export const BEST_MATCH_FIRST = sql`match_rank`;
