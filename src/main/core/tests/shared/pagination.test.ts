import { describe, it, expect } from 'vitest';
import {
  DEFAULT_PAGE_LIMIT,
  InvalidCursorError,
  MAX_PAGE_LIMIT,
  paginateArray,
  resolveLimit,
} from '../../shared/pagination';

type Row = { n: number; id: string };
const rows: Row[] = Array.from({ length: 7 }, (_, i) => ({ n: Math.floor(i / 2), id: `id_${i}` }));
const page = (opts = {}) =>
  paginateArray(
    rows,
    'n',
    (r) => r.n,
    (r) => r.id,
    opts,
  );

describe('resolveLimit', () => {
  it('defaults when undefined', () => expect(resolveLimit(undefined)).toBe(DEFAULT_PAGE_LIMIT));
  it('caps at the maximum', () => expect(resolveLimit(10_000)).toBe(MAX_PAGE_LIMIT));
  it.each([0, -1, 1.5, NaN])('rejects %s', (v) =>
    expect(() => resolveLimit(v)).toThrow(RangeError),
  );
});

describe('paginateArray', () => {
  it('returns everything with a null cursor when it fits in one page', () => {
    const result = page({ limit: 10 });
    expect(result.items).toEqual(rows);
    expect(result.nextCursor).toBeNull();
  });

  it('walks all items exactly once, including across ties in the sort value', () => {
    const seen: string[] = [];
    let cursor: string | undefined;
    do {
      const result = page({ limit: 2, cursor });
      seen.push(...result.items.map((r) => r.id));
      cursor = result.nextCursor ?? undefined;
    } while (cursor);
    expect(seen).toEqual(rows.map((r) => r.id));
  });

  it('returns null cursor when the last page is exactly full', () => {
    expect(page({ limit: 7 }).nextCursor).toBeNull();
  });

  it('cursor is opaque (not plain JSON)', () => {
    const { nextCursor } = page({ limit: 2 });
    expect(() => JSON.parse(nextCursor!)).toThrow();
  });

  it('rejects malformed cursors', () => {
    expect(() => page({ cursor: 'not-a-cursor' })).toThrow(InvalidCursorError);
    const bad = Buffer.from(JSON.stringify({ sortKey: 'n' })).toString('base64url');
    expect(() => page({ cursor: bad })).toThrow(InvalidCursorError);
  });

  it('rejects a cursor issued for a different sort', () => {
    const { nextCursor } = paginateArray(
      rows,
      'other',
      (r) => r.n,
      (r) => r.id,
      { limit: 2 },
    );
    expect(() => page({ cursor: nextCursor! })).toThrow(InvalidCursorError);
  });
});
