import { sql, SQL } from 'drizzle-orm';

/**
 * A subquery of `ids`, for `inArray(column, idList(ids))`. The ids go in as one JSON parameter
 * read with `json_each`, instead of one bound variable each: the query's shape stays the same
 * however many there are, it is past SQLite's limit of 32766 variables, and for a few hundred ids
 * or more it runs faster than a plain `IN (?, ?, …)`.
 */
export function idList(ids: readonly string[]): SQL {
  return sql`(select value from json_each(${JSON.stringify(ids)}))`;
}
