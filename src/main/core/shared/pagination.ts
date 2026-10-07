import { and, asc, desc, eq, gt, isNull, lt, or, sql, SQL } from 'drizzle-orm';
import { SQLiteColumn } from 'drizzle-orm/sqlite-core';
import { z } from 'zod';

export const DEFAULT_PAGE_LIMIT = 50;
export const MAX_PAGE_LIMIT = 200;

export interface PageOptions {
  /** opaque cursor returned as `nextCursor` by a previous call */
  cursor?: string;
  /** max number of items to return (defaults to 50, capped at 200) */
  limit?: number;
}

export interface Page<T> {
  items: T[];
  /** pass as `cursor` to get the next page, null when there are no more items */
  nextCursor: string | null;
}

export class InvalidCursorError extends Error {
  constructor(message = 'Invalid pagination cursor') {
    super(message);
    this.name = 'InvalidCursorError';
  }
}

const sortValueSchema = z.union([z.string(), z.number()]);
type SortValue = z.infer<typeof sortValueSchema>;

const cursorPayloadSchema = z.object({
  // what the list is sorted by, so a cursor can't be reused against a different ordering
  sortKey: z.string(),
  // sort value of the last item on the page; null only for a nullable sort column
  lastSortValue: sortValueSchema.nullable(),
  // id of the last item on the page (tiebreaker)
  lastId: z.string(),
});

type CursorPayload = z.infer<typeof cursorPayloadSchema>;

function encodeCursor(payload: CursorPayload): string {
  return Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
}

function decodeCursor(cursor: string, sortKey: string): CursorPayload {
  let json: unknown;
  try {
    json = JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8'));
  } catch {
    throw new InvalidCursorError();
  }
  const result = cursorPayloadSchema.safeParse(json);
  if (!result.success || result.data.sortKey !== sortKey) throw new InvalidCursorError();
  return result.data;
}

export function resolveLimit(limit: number | undefined): number {
  if (limit === undefined) return DEFAULT_PAGE_LIMIT;
  if (!Number.isInteger(limit) || limit < 1) {
    throw new RangeError('limit must be a positive integer');
  }
  return Math.min(limit, MAX_PAGE_LIMIT);
}

/**
 * How a sort column's values are represented, derived from the column itself so callers can't
 * get it out of sync: dates (timestamp columns) travel through the cursor as epoch ms.
 */
type SortKind = 'date' | 'number' | 'string';

const SORT_KINDS: readonly string[] = ['date', 'number', 'string'] satisfies SortKind[];

function sortKindOf(column: SQLiteColumn): SortKind {
  if (!SORT_KINDS.includes(column.dataType)) {
    throw new Error(`Unsupported pagination sort column type: ${column.dataType}`);
  }
  return column.dataType as SortKind;
}

function toCursorValue(value: unknown, kind: SortKind): SortValue | null {
  if (value === null) return null;
  return kind === 'date' ? (value as Date).getTime() : (value as SortValue);
}

function fromCursorValue(value: SortValue | null, kind: SortKind): SortValue | Date {
  if (value === null) throw new InvalidCursorError();
  if (kind === 'date') {
    if (typeof value !== 'number') throw new InvalidCursorError();
    return new Date(value);
  }
  if (kind === 'number' && typeof value !== 'number') throw new InvalidCursorError();
  if (kind === 'string' && typeof value !== 'string') throw new InvalidCursorError();
  return value;
}

export interface KeysetConfig<T> {
  /** stable name of the sort (e.g. 'dueDate'), embedded in the cursor */
  sortKey: string;
  sortColumn: SQLiteColumn;
  idColumn: SQLiteColumn;
  direction: 'asc' | 'desc';
  /** reads the sort value and id off a row */
  sortValue: (row: T) => unknown;
  id: (row: T) => string;
  /**
   * the sort column can hold nulls: they sort after every value in both directions,
   * ordered among themselves by id
   */
  nullable?: boolean;
}

/**
 * Keyset (seek) pagination. Orders by (sortColumn, idColumn) in the same direction
 * so the order is total, and resumes strictly after the last row of the previous page.
 *
 * With `nullable`, null values come last whichever the direction, ordered among themselves by id.
 * sqlite sorts null below every value, so descending order already puts them last; ascending
 * order leads with `(sortColumn IS NULL)`, and needs an index on that same expression list,
 * (sortColumn IS NULL, sortColumn, idColumn), to avoid a sort step.
 */
export function keyset<T>(config: KeysetConfig<T>, options: PageOptions = {}) {
  const limit = resolveLimit(options.limit);
  const kind = sortKindOf(config.sortColumn);
  const cmp = config.direction === 'asc' ? gt : lt;
  const { sortColumn, idColumn } = config;

  let after: SQL | undefined;
  if (options.cursor !== undefined) {
    const payload = decodeCursor(options.cursor, config.sortKey);
    if (config.nullable && payload.lastSortValue === null) {
      // past the last value: only the remaining nulls are left. Ascending, the null test is a
      // range on the index's leading expression: sqlite then reads that index in order, where an
      // equality on an expression (or a plain IS NULL, which seeks (sortColumn, id)) needs a sort
      const nullTest =
        config.direction === 'asc' ? sql`(${sortColumn} IS NULL) > 0` : isNull(sortColumn);
      after = and(nullTest, cmp(idColumn, payload.lastId));
    } else {
      const value = fromCursorValue(payload.lastSortValue, kind);
      if (config.nullable && config.direction === 'asc') {
        // compared as a row value over the index's expression list, so sqlite can seek into it;
        // a null row is (1, null, id) and so lands after the cursor without comparing the null
        const lastValue = sortColumn.mapToDriverValue(value);
        after = sql`((${sortColumn} IS NULL), ${sortColumn}, ${idColumn}) > (0, ${lastValue}, ${payload.lastId})`;
      } else {
        after = or(
          cmp(sortColumn, value),
          and(eq(sortColumn, value), cmp(idColumn, payload.lastId)),
          // descending: every null sorts after every value
          config.nullable ? isNull(sortColumn) : undefined,
        );
      }
    }
  }

  const dir = config.direction === 'asc' ? asc : desc;
  const nullsLast =
    config.nullable && config.direction === 'asc' ? [asc(sql`(${sortColumn} IS NULL)`)] : [];
  return {
    after,
    orderBy: [...nullsLast, dir(sortColumn), dir(idColumn)] as const,
    // fetch one extra row to know whether another page exists
    fetchLimit: limit + 1,
    toPage(rows: T[]): Page<T> {
      const items = rows.slice(0, limit);
      const last = items[items.length - 1];
      const nextCursor =
        rows.length > limit && last
          ? encodeCursor({
              sortKey: config.sortKey,
              lastSortValue: toCursorValue(config.sortValue(last), kind),
              lastId: config.id(last),
            })
          : null;
      return { items, nextCursor };
    },
  };
}

/**
 * Cursor pagination over an in-memory list that is already sorted by (sortValue, id) ascending.
 */
export function paginateArray<T>(
  sorted: T[],
  sortKey: string,
  sortValue: (row: T) => SortValue,
  id: (row: T) => string,
  options: PageOptions = {},
): Page<T> {
  const limit = resolveLimit(options.limit);
  let start = 0;
  if (options.cursor !== undefined) {
    const payload = decodeCursor(options.cursor, sortKey);
    if (payload.lastSortValue === null) throw new InvalidCursorError();
    const lastSortValue = payload.lastSortValue;
    start = sorted.findIndex((row) => {
      const v = sortValue(row);
      return v > lastSortValue || (v === lastSortValue && id(row) > payload.lastId);
    });
    if (start === -1) start = sorted.length;
  }
  const items = sorted.slice(start, start + limit);
  const last = items[items.length - 1];
  const nextCursor =
    start + limit < sorted.length && last
      ? encodeCursor({ sortKey, lastSortValue: sortValue(last), lastId: id(last) })
      : null;
  return { items, nextCursor };
}
