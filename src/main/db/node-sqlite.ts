import { AsyncLocalStorage } from 'node:async_hooks';
import type { DatabaseSync, SQLInputValue, StatementResultingChanges } from 'node:sqlite';
import type { BaseSQLiteDatabase } from 'drizzle-orm/sqlite-core';
import { drizzle as drizzleProxy } from 'drizzle-orm/sqlite-proxy';
import { migrate as migrateProxy } from 'drizzle-orm/sqlite-proxy/migrator';
import type { Casing } from 'drizzle-orm';
import type { MigrationConfig } from 'drizzle-orm/migrator';

// Drizzle's sqlite-proxy driver over Node's built-in `node:sqlite`. Drizzle builds the SQL and hands
// it to `execute` below, which runs it on a `DatabaseSync`. The proxy driver is async, so every
// query returns a Promise even though node:sqlite does the work synchronously.

/** what `.run()` resolves to: the proxy's `rows`, plus node:sqlite's change counts */
export type NodeSQLiteRunResult = { rows: unknown[] } & StatementResultingChanges;

export type NodeSQLiteDatabase = BaseSQLiteDatabase<'async', NodeSQLiteRunResult> & {
  $client: DatabaseSync;
};

type Method = 'run' | 'all' | 'values' | 'get';

/**
 * Keeps a transaction's queries to itself. The proxy driver runs a transaction as BEGIN, the
 * awaited callback, then COMMIT on the one connection, so without this any query issued while the
 * callback is awaiting something would land inside the open transaction (and be rolled back with
 * it). A transaction holds the gate for its whole run; queries from inside it (tracked with
 * AsyncLocalStorage, which follows awaits) go straight through, everything else waits its turn.
 */
class ConnectionGate {
  private readonly context = new AsyncLocalStorage<symbol>();
  private holder: symbol | null = null;
  private queue: Promise<void> = Promise.resolve();

  /** true when another transaction holds the connection */
  blocked(): boolean {
    return this.holder !== null && this.context.getStore() !== this.holder;
  }

  /** settles once the current holder lets go; callers re-check `blocked()` after it */
  released(): Promise<void> {
    return this.queue;
  }

  async exclusive<T>(fn: () => Promise<T>): Promise<T> {
    // a transaction started from inside the one holding the gate already has the connection
    if (this.holder !== null && this.context.getStore() === this.holder) return fn();

    const previous = this.queue;
    let release!: () => void;
    this.queue = new Promise((resolve) => (release = resolve));
    await previous;

    const token = Symbol('transaction');
    this.holder = token;
    try {
      return await this.context.run(token, fn);
    } finally {
      this.holder = null;
      release();
    }
  }
}

export interface DrizzleNodeSQLiteConfig {
  client: DatabaseSync;
  casing?: Casing;
}

export function drizzle({ client, casing }: DrizzleNodeSQLiteConfig): NodeSQLiteDatabase {
  const gate = new ConnectionGate();

  const execute = async (sql: string, params: unknown[], method: Method) => {
    // checked and run with no await in between, so no transaction can start in the gap
    while (gate.blocked()) await gate.released();
    return run(client, sql, params as SQLInputValue[], method);
  };

  // drizzle 0.45 reads `casing` only from the third argument, even though its overloads also
  // accept the config second, so the (unused) batch callback slot is passed explicitly
  const db = drizzleProxy(execute, undefined, { casing }) as unknown as NodeSQLiteDatabase;

  const transaction = db.transaction.bind(db);
  db.transaction = ((callback, config) =>
    gate.exclusive(() => transaction(callback, config))) as typeof db.transaction;

  gates.set(db, gate);
  return Object.assign(db, { $client: client });
}

// the proxy expects arrays of column values back. For `get`, `rows` is the single row itself (or
// undefined), though drizzle's callback type still calls it an array.
function run(
  client: DatabaseSync,
  sql: string,
  params: SQLInputValue[],
  method: Method,
): { rows: unknown[] } {
  const stmt = client.prepare(sql);
  if (method === 'run') return { rows: [], ...stmt.run(...params) };
  stmt.setReturnArrays(true);
  const rows = method === 'get' ? stmt.get(...params) : stmt.all(...params);
  return { rows: rows as unknown as unknown[] };
}

const gates = new WeakMap<NodeSQLiteDatabase, ConnectionGate>();

/**
 * Applies every pending migration in one transaction. drizzle's proxy migrator works out which
 * migrations are pending and hands over their statements; running them is left to the driver.
 */
export async function migrate(db: NodeSQLiteDatabase, config: MigrationConfig): Promise<void> {
  const gate = gates.get(db)!;
  await migrateProxy(
    db as never,
    (queries) =>
      gate.exclusive(async () => {
        db.$client.exec('BEGIN');
        try {
          for (const query of queries) {
            try {
              db.$client.exec(query);
            } catch (cause) {
              throw new Error(`Failed to run the query '${query}'`, { cause });
            }
          }
          db.$client.exec('COMMIT');
        } catch (error) {
          db.$client.exec('ROLLBACK');
          throw error;
        }
      }),
    config,
  );
}
