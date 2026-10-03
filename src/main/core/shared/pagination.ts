import { and, asc, desc, eq, gt, lt, or, SQL } from 'drizzle-orm';
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
  // sort value of the last item on the page
  lastSortValue: sortValueSchema,
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

/** Wire form of a sort value as stored in the cursor. */
export type SortKind = 'date' | 'number' | 'text';

function toCursorValue(value: unknown, kind: SortKind): SortValue {
  return kind === 'date' ? (value as Date).getTime() : (value as SortValue);
}

function fromCursorValue(value: SortValue, kind: SortKind): SortValue | Date {
  if (kind === 'date') {
    if (typeof value !== 'number') throw new InvalidCursorError();
    return new Date(value);
  }
  if (kind === 'number' && typeof value !== 'number') throw new InvalidCursorError();
  if (kind === 'text' && typeof value !== 'string') throw new InvalidCursorError();
  return value;
}

export interface KeysetConfig<T> {
  /** stable name of the sort (e.g. 'dueDate'), embedded in the cursor */
  sortKey: string;
  sortColumn: SQLiteColumn;
  idColumn: SQLiteColumn;
  kind: SortKind;
  direction: 'asc' | 'desc';
  /** reads the sort value and id off a row */
  sortValue: (row: T) => unknown;
  id: (row: T) => string;
}

/**
 * Keyset (seek) pagination. Orders by (sortColumn, idColumn) in the same direction
 * so the order is total, and resumes strictly after the last row of the previous page.
 */
export function keyset<T>(config: KeysetConfig<T>, options: PageOptions = {}) {
  const limit = resolveLimit(options.limit);
  const cmp = config.direction === 'asc' ? gt : lt;

  let after: SQL | undefined;
  if (options.cursor !== undefined) {
    const payload = decodeCursor(options.cursor, config.sortKey);
    const value = fromCursorValue(payload.lastSortValue, config.kind);
    after = or(
      cmp(config.sortColumn, value),
      and(eq(config.sortColumn, value), cmp(config.idColumn, payload.lastId)),
    );
  }

  const dir = config.direction === 'asc' ? asc : desc;
  return {
    after,
    orderBy: [dir(config.sortColumn), dir(config.idColumn)] as const,
    // fetch one extra row to know whether another page exists
    fetchLimit: limit + 1,
    toPage(rows: T[]): Page<T> {
      const items = rows.slice(0, limit);
      const last = items[items.length - 1];
      const nextCursor =
        rows.length > limit && last
          ? encodeCursor({
              sortKey: config.sortKey,
              lastSortValue: toCursorValue(config.sortValue(last), config.kind),
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
    start = sorted.findIndex((row) => {
      const v = sortValue(row);
      return v > payload.lastSortValue || (v === payload.lastSortValue && id(row) > payload.lastId);
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
