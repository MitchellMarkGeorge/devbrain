import { describe, it, expect, beforeEach } from 'vitest';
import { DatabaseSync } from 'node:sqlite';
import { eq, sql } from 'drizzle-orm';
import { integer, sqliteTable, text, blob } from 'drizzle-orm/sqlite-core';
import { drizzle, NodeSQLiteDatabase } from '@main/db/node-sqlite';
import { pluckAll } from '../utils';

// The node:sqlite proxy driver on its own, against a throwaway table: the services' tests cover it
// through real queries, these pin down the driver's own behaviour and the connection gate.

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
const tick = () => new Promise((resolve) => setTimeout(resolve, 1));

describe('node:sqlite proxy driver — queries', () => {
  it('reads rows as objects, arrays and single rows', async () => {
    await db
      .insert(items)
      .values([{ name: 'a' }, { name: 'b' }])
      .run();

    expect(await db.select().from(items).all()).toEqual([
      { id: 1, name: 'a', data: null },
      { id: 2, name: 'b', data: null },
    ]);
    expect(await db.select({ name: items.name }).from(items).where(eq(items.id, 2)).get()).toEqual({
      name: 'b',
    });
    expect(await db.select().from(items).where(eq(items.id, 3)).get()).toBeUndefined();
    expect(await db.values(sql`SELECT id, name FROM items ORDER BY id`)).toEqual([
      [1, 'a'],
      [2, 'b'],
    ]);
  });

  it('returns raw queries as arrays of column values', async () => {
    await db.insert(items).values({ name: 'a' }).run();
    // the proxy callback is not told whether a raw query wants objects, so it gets arrays
    expect(await db.all(sql`SELECT id, name FROM items`)).toEqual([[1, 'a']]);
  });

  it('returns changes and the last rowid from run', async () => {
    const result = await db.insert(items).values({ name: 'a' }).run();
    expect(result).toMatchObject({ changes: 1, lastInsertRowid: 1 });
  });

  it('returns blob columns as Buffers', async () => {
    await db
      .insert(items)
      .values({ name: 'a', data: Buffer.from('secret') })
      .run();
    const row = await db.select({ data: items.data }).from(items).get();
    expect(Buffer.isBuffer(row!.data)).toBe(true);
    expect(row!.data!.toString()).toBe('secret');
  });
});

describe('node:sqlite proxy driver — transactions', () => {
  it('commits when the callback resolves', async () => {
    const result = await db.transaction(async (tx) => {
      await tx.insert(items).values({ name: 'a' }).run();
      return 'done';
    });
    expect(result).toBe('done');
    expect(names()).toEqual(['a']);
    expect(sqlite.isTransaction).toBe(false);
  });

  it('rolls back and rethrows when the callback rejects', async () => {
    await expect(
      db.transaction(async (tx) => {
        await tx.insert(items).values({ name: 'a' }).run();
        throw new Error('boom');
      }),
    ).rejects.toThrow('boom');
    expect(names()).toEqual([]);
    expect(sqlite.isTransaction).toBe(false);
  });

  it('rolls back on tx.rollback()', async () => {
    await expect(
      db.transaction(async (tx) => {
        await tx.insert(items).values({ name: 'a' }).run();
        tx.rollback();
      }),
    ).rejects.toThrow();
    expect(names()).toEqual([]);
  });

  it('rolls back only the inner savepoint of a nested transaction', async () => {
    await db.transaction(async (tx) => {
      await tx.insert(items).values({ name: 'outer' }).run();
      await expect(
        tx.transaction(async (inner) => {
          await inner.insert(items).values({ name: 'inner' }).run();
          throw new Error('inner');
        }),
      ).rejects.toThrow('inner');
    });
    expect(names()).toEqual(['outer']);
  });
});

/** a transaction that stays open until `release()`, with `started` settling once it has written */
function heldTransaction(db: NodeSQLiteDatabase, name: string, fail = false) {
  let release!: () => void;
  let started!: () => void;
  const held = new Promise<void>((resolve) => (release = resolve));
  const isStarted = new Promise<void>((resolve) => (started = resolve));
  const done = db.transaction(async (tx) => {
    await tx.insert(items).values({ name }).run();
    started();
    await held;
    if (fail) throw new Error('boom');
  });
  return { started: isStarted, release, done };
}

describe('node:sqlite proxy driver — connection gate', () => {
  it("keeps another caller's query out of an open transaction", async () => {
    const tx = heldTransaction(db, 'inside', true);
    await tx.started;

    // another caller writes while the transaction is waiting on something else
    const outside = db.insert(items).values({ name: 'outside' }).run();
    await tick();
    tx.release();

    await expect(tx.done).rejects.toThrow('boom');
    await outside;
    // the rollback took only the transaction's own row
    expect(names()).toEqual(['outside']);
  });

  it('holds other queries until the transaction settles', async () => {
    const tx = heldTransaction(db, 'tx');
    await tx.started;

    let read = false;
    const reading = db
      .select()
      .from(items)
      .all()
      .then((rows) => {
        read = true;
        return rows;
      });
    await tick();
    expect(read).toBe(false);

    tx.release();
    await tx.done;
    // the read ran after the commit, so it sees the transaction's row
    expect(await reading).toHaveLength(1);
  });

  it('runs transactions one at a time', async () => {
    const order: string[] = [];
    const run = (name: string) =>
      db.transaction(async (tx) => {
        order.push(`${name} start`);
        await tx.insert(items).values({ name }).run();
        await tick();
        order.push(`${name} end`);
      });

    await Promise.all([run('a'), run('b')]);
    expect(order).toEqual(['a start', 'a end', 'b start', 'b end']);
    expect(names()).toEqual(['a', 'b']);
  });

  it('counts work started from inside a transaction as part of it', async () => {
    // AsyncLocalStorage follows anything the callback starts, awaited or not, so a query fired
    // off from inside the transaction runs in it and is rolled back with it
    let fired: Promise<unknown> = Promise.resolve();
    await expect(
      db.transaction(async (tx) => {
        await tx.insert(items).values({ name: 'inside' }).run();
        fired = db.insert(items).values({ name: 'fired' }).run();
        await tick();
        throw new Error('boom');
      }),
    ).rejects.toThrow('boom');
    await fired;
    expect(names()).toEqual([]);
  });
});
