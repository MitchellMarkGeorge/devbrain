import { describe, it, expect, beforeEach } from 'vitest';
import { DatabaseSync } from 'node:sqlite';
import { eq, sql } from 'drizzle-orm';
import { integer, sqliteTable, text, blob } from 'drizzle-orm/sqlite-core';
import { drizzle, NodeSQLiteDatabase } from '@main/db/node-sqlite';
import { pluckAll } from '../utils';

// The node:sqlite driver on its own, against a throwaway table: the services' tests cover it
// through real queries, these pin down the parts better-sqlite3 used to do for us.

const items = sqliteTable('items', {
  id: integer().primaryKey(),
  name: text().notNull(),
  data: blob({ mode: 'buffer' }),
});

let sqlite: DatabaseSync;
let db: NodeSQLiteDatabase;

beforeEach(() => {
  sqlite = new DatabaseSync(':memory:');
  sqlite.exec('CREATE TABLE items (id integer primary key, name text not null, data blob)');
  db = drizzle({ client: sqlite, casing: 'snake_case' });
});

const names = () => pluckAll(sqlite, 'SELECT name FROM items ORDER BY id');

describe('node:sqlite driver — queries', () => {
  it('reads rows as objects, arrays and single rows', () => {
    db.insert(items)
      .values([{ name: 'a' }, { name: 'b' }])
      .run();

    expect(db.select().from(items).all()).toEqual([
      { id: 1, name: 'a', data: null },
      { id: 2, name: 'b', data: null },
    ]);
    expect(db.select({ name: items.name }).from(items).where(eq(items.id, 2)).get()).toEqual({
      name: 'b',
    });
    expect(db.select().from(items).where(eq(items.id, 3)).get()).toBeUndefined();
    expect(db.values(sql`SELECT id, name FROM items ORDER BY id`)).toEqual([
      [1, 'a'],
      [2, 'b'],
    ]);
    expect(db.all(sql`SELECT name FROM items WHERE id = ${1}`)).toEqual([{ name: 'a' }]);
  });

  it('reads the same prepared query as objects and as arrays', () => {
    db.insert(items).values({ name: 'a' }).run();
    const query = db.select({ name: items.name }).from(items).prepare();

    expect(query.values()).toEqual([['a']]);
    expect(query.all()).toEqual([{ name: 'a' }]);
    expect(query.values()).toEqual([['a']]);
  });

  it('returns changes and the last rowid from run', () => {
    const result = db.insert(items).values({ name: 'a' }).run();
    expect(result).toMatchObject({ changes: 1, lastInsertRowid: 1 });
  });

  it('returns blob columns as Buffers', () => {
    db.insert(items)
      .values({ name: 'a', data: Buffer.from('secret') })
      .run();
    const { data } = db.select({ data: items.data }).from(items).get()!;
    expect(Buffer.isBuffer(data)).toBe(true);
    expect(data!.toString()).toBe('secret');
  });
});

describe('node:sqlite driver — transactions', () => {
  it('commits when the callback returns', () => {
    const result = db.transaction((tx) => {
      tx.insert(items).values({ name: 'a' }).run();
      return 'done';
    });
    expect(result).toBe('done');
    expect(names()).toEqual(['a']);
    expect(sqlite.isTransaction).toBe(false);
  });

  it('rolls back and rethrows when the callback throws', () => {
    expect(() =>
      db.transaction((tx) => {
        tx.insert(items).values({ name: 'a' }).run();
        throw new Error('boom');
      }),
    ).toThrow('boom');
    expect(names()).toEqual([]);
    expect(sqlite.isTransaction).toBe(false);
  });

  it('rolls back on tx.rollback()', () => {
    expect(() =>
      db.transaction((tx) => {
        tx.insert(items).values({ name: 'a' }).run();
        tx.rollback();
      }),
    ).toThrow();
    expect(names()).toEqual([]);
  });

  it('rolls back only the inner savepoint of a nested transaction', () => {
    db.transaction((tx) => {
      tx.insert(items).values({ name: 'outer' }).run();
      expect(() =>
        tx.transaction((inner) => {
          inner.insert(items).values({ name: 'inner' }).run();
          throw new Error('inner');
        }),
      ).toThrow('inner');
    });
    expect(names()).toEqual(['outer']);
  });

  it('refuses an async callback and rolls back', () => {
    expect(() =>
      db.transaction(async (tx) => {
        tx.insert(items).values({ name: 'a' }).run();
      }),
    ).toThrow(/cannot return a promise/);
    expect(names()).toEqual([]);
    expect(sqlite.isTransaction).toBe(false);
  });

  it('uses a savepoint when the connection is already in a transaction', () => {
    sqlite.exec('BEGIN');
    sqlite.exec(`INSERT INTO items (name) VALUES ('manual')`);
    expect(() =>
      db.transaction((tx) => {
        tx.insert(items).values({ name: 'a' }).run();
        throw new Error('boom');
      }),
    ).toThrow('boom');
    // the outer transaction is still open, with only its own row
    expect(sqlite.isTransaction).toBe(true);
    sqlite.exec('COMMIT');
    expect(names()).toEqual(['manual']);
  });

  it('honours the transaction behaviour', () => {
    db.transaction(
      (tx) => {
        tx.insert(items).values({ name: 'a' }).run();
      },
      { behavior: 'immediate' },
    );
    expect(names()).toEqual(['a']);
  });
});
