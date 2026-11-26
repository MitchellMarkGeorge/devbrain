import { inArray, isNull, or, sql, type SQL } from 'drizzle-orm';
import type { SQLiteColumn } from 'drizzle-orm/sqlite-core';
import { listOf, type OneOrMany } from '@common/types';

// Conditions for list filters that take one value or several ("any of these").

const NOTHING = sql`0`;

/** The rows that meet any of `conditions`. With none, no row matches. */
export function anyOf(conditions: readonly SQL[]): SQL {
  if (conditions.length === 0) return NOTHING;
  return conditions.length === 1 ? conditions[0]! : (or(...conditions) as SQL);
}

/**
 * The rows whose `column` is one of `values`. A null among them stands for the rows with no value
 * (the tasks in no project), so it can sit beside real ones: `IS NULL OR IN (…)`. An empty list
 * matches nothing.
 */
export function isOneOf<T extends string | number>(
  column: SQLiteColumn,
  values: OneOrMany<T | null>,
): SQL {
  const list = listOf(values);
  const present = [...new Set(list.filter((value): value is T => value !== null))];
  const conditions: SQL[] = [];
  if (list.includes(null)) conditions.push(isNull(column));
  if (present.length > 0) conditions.push(inArray(column, present));
  return anyOf(conditions);
}
