import type { DatabaseSync, StatementResultingChanges, StatementSync } from 'node:sqlite';
import { NoopCache, type Cache } from 'drizzle-orm/cache/core';
import type { WithCacheConfig } from 'drizzle-orm/cache/core/types';
import { entityKind, type Casing } from 'drizzle-orm';
import { DefaultLogger, NoopLogger, type Logger } from 'drizzle-orm/logger';
import { readMigrationFiles, type MigrationConfig } from 'drizzle-orm/migrator';
import { fillPlaceholders, sql, type Query } from 'drizzle-orm/sql/sql';
import {
  BaseSQLiteDatabase,
  SQLitePreparedQuery,
  SQLiteSession,
  SQLiteSyncDialect,
  SQLiteTransaction,
  type SelectedFieldsOrdered,
  type SQLiteExecuteMethod,
  type SQLiteTransactionConfig,
} from 'drizzle-orm/sqlite-core';
import * as drizzleUtils from 'drizzle-orm/utils';

// A synchronous drizzle driver for Node's built-in `node:sqlite`, so the main process needs no
// native module. drizzle-orm 0.45 only ships `node:sqlite` support in its 1.0 line, where the
// driver is async, so this mirrors its better-sqlite3 driver instead: same sync API, same
// prepared-query behaviour, with `node:sqlite`'s `DatabaseSync` underneath.

export type NodeSQLiteRunResult = StatementResultingChanges;

type EmptySchema = Record<string, never>;
type PreparedQueryConfig = {
  type: 'sync';
  run: NodeSQLiteRunResult;
  all: unknown;
  get: unknown;
  values: unknown;
  execute: unknown;
};
type QueryMetadata = { type: 'select' | 'update' | 'delete' | 'insert'; tables: string[] };
type ResultMapper = (rows: unknown[][]) => unknown;
type Params = Parameters<StatementSync['all']>;

// exported at runtime but marked @internal in drizzle's type declarations
const { mapResultRow } = drizzleUtils as unknown as {
  mapResultRow: (
    columns: SelectedFieldsOrdered,
    row: unknown[],
    joinsNotNullableMap: Record<string, boolean> | undefined,
  ) => unknown;
};

class NodeSQLitePreparedQuery extends SQLitePreparedQuery<PreparedQueryConfig> {
  static override readonly [entityKind]: string = 'NodeSQLitePreparedQuery';

  constructor(
    private readonly stmt: StatementSync,
    query: Query,
    private readonly logger: Logger,
    cache: Cache,
    queryMetadata: QueryMetadata | undefined,
    cacheConfig: WithCacheConfig | undefined,
    private readonly fields: SelectedFieldsOrdered | undefined,
    executeMethod: SQLiteExecuteMethod,
    private readonly _isResponseInArrayMode: boolean,
    private readonly customResultMapper?: ResultMapper,
  ) {
    super('sync', executeMethod, query, cache, queryMetadata, cacheConfig);
  }

  run(placeholderValues?: Record<string, unknown>): NodeSQLiteRunResult {
    return this.stmt.run(...this.params(placeholderValues));
  }

  all(placeholderValues?: Record<string, unknown>): unknown {
    const { fields, customResultMapper } = this;
    if (!fields && !customResultMapper) {
      return this.execute_('all', false, placeholderValues);
    }
    const rows = this.values(placeholderValues);
    if (customResultMapper) return customResultMapper(rows);
    return rows.map((row) => mapResultRow(fields!, row, this.joinsNotNullableMap));
  }

  get(placeholderValues?: Record<string, unknown>): unknown {
    const { fields, customResultMapper } = this;
    if (!fields && !customResultMapper) {
      return this.execute_('get', false, placeholderValues);
    }
    const row = this.execute_('get', true, placeholderValues) as unknown[] | undefined;
    if (!row) return undefined;
    if (customResultMapper) return customResultMapper([row]);
    return mapResultRow(fields!, row, this.joinsNotNullableMap);
  }

  values(placeholderValues?: Record<string, unknown>): unknown[][] {
    return this.execute_('all', true, placeholderValues) as unknown[][];
  }

  /** @internal */
  isResponseInArrayMode(): boolean {
    return this._isResponseInArrayMode;
  }

  // set on the instance by drizzle's query builders; declared here for the type checker
  declare joinsNotNullableMap?: Record<string, boolean>;

  // node:sqlite has no per-call `.raw()` like better-sqlite3, so the statement's array mode is
  // set before every call: the same prepared query can be read as objects and as arrays
  private execute_(
    method: 'all' | 'get',
    arrays: boolean,
    placeholderValues?: Record<string, unknown>,
  ): unknown {
    this.stmt.setReturnArrays(arrays);
    return this.stmt[method](...this.params(placeholderValues));
  }

  private params(placeholderValues?: Record<string, unknown>): Params {
    const params = fillPlaceholders(this.query.params, placeholderValues ?? {});
    this.logger.logQuery(this.query.sql, params);
    return params as Params;
  }
}

export class NodeSQLiteSession extends SQLiteSession<
  'sync',
  NodeSQLiteRunResult,
  EmptySchema,
  EmptySchema
> {
  static override readonly [entityKind]: string = 'NodeSQLiteSession';

  constructor(
    private readonly client: DatabaseSync,
    private readonly syncDialect: SQLiteSyncDialect,
    private readonly logger: Logger,
    private readonly cache: Cache = new NoopCache(),
  ) {
    super(syncDialect);
  }

  prepareQuery(
    query: Query,
    fields: SelectedFieldsOrdered | undefined,
    executeMethod: SQLiteExecuteMethod,
    isResponseInArrayMode: boolean,
    customResultMapper?: ResultMapper,
    queryMetadata?: QueryMetadata,
    cacheConfig?: WithCacheConfig,
  ): NodeSQLitePreparedQuery {
    return new NodeSQLitePreparedQuery(
      this.client.prepare(query.sql),
      query,
      this.logger,
      this.cache,
      queryMetadata,
      cacheConfig,
      fields,
      executeMethod,
      isResponseInArrayMode,
      customResultMapper,
    );
  }

  // better-sqlite3's `db.transaction()` has no node:sqlite counterpart, so this does what it does:
  // BEGIN, run the callback, COMMIT, or ROLLBACK and rethrow. When the connection is already inside
  // a transaction the callback runs in a savepoint instead.
  transaction<T>(
    transaction: (tx: NodeSQLiteTransaction) => T,
    config: SQLiteTransactionConfig = {},
  ): T {
    const tx = new NodeSQLiteTransaction('sync', this.syncDialect, this, undefined);
    const nested = this.client.isTransaction;
    const [begin, commit, rollback] = nested
      ? ['savepoint drizzle_tx', 'release savepoint drizzle_tx', 'rollback to savepoint drizzle_tx']
      : [`begin ${config.behavior ?? 'deferred'}`, 'commit', 'rollback'];

    this.client.exec(begin);
    try {
      const result = transaction(tx);
      if (result instanceof Promise) {
        throw new TypeError('Transaction function cannot return a promise');
      }
      this.client.exec(commit);
      return result;
    } catch (error) {
      // a failed COMMIT can leave the transaction already closed
      if (this.client.isTransaction) {
        this.client.exec(rollback);
        if (nested) this.client.exec('release savepoint drizzle_tx');
      }
      throw error;
    }
  }
}

export class NodeSQLiteTransaction extends SQLiteTransaction<
  'sync',
  NodeSQLiteRunResult,
  EmptySchema,
  EmptySchema
> {
  static override readonly [entityKind]: string = 'NodeSQLiteTransaction';

  override transaction<T>(transaction: (tx: NodeSQLiteTransaction) => T): T {
    const savepointName = `sp${this.nestedIndex}`;
    const tx = new NodeSQLiteTransaction(
      'sync',
      this.txDialect,
      this.txSession,
      this.schema,
      this.nestedIndex + 1,
    );
    this.txSession.run(sql.raw(`savepoint ${savepointName}`));
    try {
      const result = transaction(tx);
      this.txSession.run(sql.raw(`release savepoint ${savepointName}`));
      return result;
    } catch (err) {
      this.txSession.run(sql.raw(`rollback to savepoint ${savepointName}`));
      throw err;
    }
  }

  // drizzle keeps these on the instance but leaves them out of its type declarations
  private get txDialect(): SQLiteSyncDialect {
    return (this as unknown as { dialect: SQLiteSyncDialect }).dialect;
  }

  private get txSession(): NodeSQLiteSession {
    return (this as unknown as { session: NodeSQLiteSession }).session;
  }
}

export class NodeSQLiteDatabase extends BaseSQLiteDatabase<
  'sync',
  NodeSQLiteRunResult,
  EmptySchema,
  EmptySchema
> {
  static override readonly [entityKind]: string = 'NodeSQLiteDatabase';
}

export interface DrizzleNodeSQLiteConfig {
  client: DatabaseSync;
  casing?: Casing;
  logger?: boolean | Logger;
}

export function drizzle({
  client,
  casing,
  logger,
}: DrizzleNodeSQLiteConfig): NodeSQLiteDatabase & { $client: DatabaseSync } {
  const dialect = new SQLiteSyncDialect({ casing });
  const queryLogger = logger === true ? new DefaultLogger() : logger ? logger : new NoopLogger();
  const session = new NodeSQLiteSession(client, dialect, queryLogger);
  const db = new NodeSQLiteDatabase('sync', dialect, session, undefined);
  return Object.assign(db, { $client: client });
}

/** drizzle's migrator for this driver; applies every pending migration in one transaction */
export function migrate(db: NodeSQLiteDatabase, config: MigrationConfig): void {
  const migrations = readMigrationFiles(config);
  // like drizzle's own migrators, this reaches the dialect and session drizzle keeps internal
  const { dialect, session } = db as unknown as {
    dialect: SQLiteSyncDialect;
    session: Parameters<SQLiteSyncDialect['migrate']>[1];
  };
  dialect.migrate(migrations, session, config);
}
