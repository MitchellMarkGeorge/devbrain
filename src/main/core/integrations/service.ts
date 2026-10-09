import { ExternalSourceId, IntegrationId } from '@common/ids';
import { externalSources, integrations } from '@main/db/schema/integrations';
import { and, asc, eq, inArray, sql } from 'drizzle-orm';
import { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import {
  ConnectInProgressError,
  IntegrationAlreadyConnectedError,
  IntegrationAuthError,
  IntegrationDisabledError,
  NotFoundError,
} from '../shared/errors';
import { toAuth } from './auth';
import { CredentialStore } from './credential-store';
import { ApiKeyCredentials, Credentials, OAuthCredentials } from './credentials';
import { OAuthClient } from './oauth/types';
import { ExternalAccount, Provider as ProviderImpl } from './providers/provider';
import { ProviderRegistry, getProvider } from './providers/registry';
import {
  AuthType,
  ExternalSource,
  Integration,
  IntegrationStatus,
  Provider,
  SourceType,
} from './types';

// What changed, for in-process subscribers: the scheduler starts and stops syncs from these, and
// the IPC layer will forward them to the renderer. Ids and flags only, never credentials.
export type IntegrationChange =
  | {
      type: 'connected';
      integrationId: IntegrationId;
      // every source the connection got; the scheduler starts the enabled ones
      sources: { sourceId: ExternalSourceId; enabled: boolean }[];
    }
  | { type: 'status_changed'; integrationId: IntegrationId; status: IntegrationStatus }
  | {
      type: 'source_changed';
      integrationId: IntegrationId;
      sourceId: ExternalSourceId;
      enabled: boolean;
    }
  | {
      // a sync run ended and recorded its outcome: lastSyncedAt, lastError, retryAt
      type: 'sync_status_changed';
      integrationId: IntegrationId;
      sourceId: ExternalSourceId;
      source: ExternalSource;
    };

export type IntegrationChangeListener = (change: IntegrationChange) => void;

export interface ConnectOptions {
  // The source types to switch on, from those the provider supports; defaults to all of them.
  // Every supported type still gets a source, created disabled when left out, so turning it on
  // later is setSourceEnabled and needs no reconnect. An empty list connects without syncing.
  enable?: SourceType[];
}

export interface OAuthConnectOptions extends ConnectOptions {
  // cancels the flow while it waits on the browser; the later IPC channel is integrations:cancelConnect
  signal?: AbortSignal;
}

export interface EnableOptions {
  // the source types to switch back on when a disabled integration is enabled; defaults to all
  enable?: SourceType[];
}

// What the sync engine needs to start a run: the source's stored state and its integration's.
// The cursor and config are the raw JSON; the engine validates them.
export interface SyncTarget {
  integrationId: IntegrationId;
  provider: Provider;
  status: IntegrationStatus;
  sourceType: SourceType;
  enabled: boolean;
  cursor: unknown;
  config: unknown;
  initialSyncCompletedAt: Date | null;
  retryAt: Date | null;
  // failed runs in a row; the scheduler backs off by it
  consecutiveFailures: number;
}

// how a sync run ended, as recorded on its source
export type SyncOutcome =
  | { ok: true; at: Date }
  | {
      ok: false;
      error: string;
      // false for a rate limit: retryAt is the wait, so it does not also count toward backoff
      countsAsFailure: boolean;
      retryAt?: Date;
    };

export interface IntegrationServiceOptions {
  credentials: CredentialStore;
  providers: ProviderRegistry;
  // runs connectWithOAuth's browser flow; without one, connecting through OAuth is refused
  oauth?: OAuthClient;
}

type IntegrationRow = typeof integrations.$inferSelect;
type SourceRow = typeof externalSources.$inferSelect;

// Connect, enable and disable. Owns the integrations and external_sources tables; credentials go
// through CredentialStore and never appear on what this returns.
export class IntegrationService {
  private readonly credentials: CredentialStore;
  private readonly providers: ProviderRegistry;
  private readonly oauth: OAuthClient | null;
  private readonly listeners = new Set<IntegrationChangeListener>();
  // set while an OAuth connect waits on the browser; one flow per workspace at a time
  private connecting = false;

  constructor(
    private readonly db: BetterSQLite3Database,
    options: IntegrationServiceOptions,
  ) {
    this.credentials = options.credentials;
    this.providers = options.providers;
    this.oauth = options.oauth ?? null;
  }

  async list(): Promise<Integration[]> {
    const rows = this.db
      .select()
      .from(integrations)
      .orderBy(asc(integrations.createdAt), asc(integrations.id))
      .all();
    return this.withSources(rows);
  }

  async getById(id: IntegrationId): Promise<Integration> {
    const row = this.db.select().from(integrations).where(eq(integrations.id, id)).get();
    if (!row) throw new NotFoundError(id);
    const [integration] = this.withSources([row]);
    return integration;
  }

  /**
   * Validates the key with the provider, then stores the integration, its encrypted credentials and
   * one source per type the provider supports, in one transaction. Only the types in
   * `options.enable` are switched on (all of them by default). A rejected key throws the provider's
   * IntegrationAuthError and writes nothing.
   */
  async connectWithApiKey(
    providerId: Provider,
    apiKey: string,
    options: ConnectOptions = {},
  ): Promise<Integration> {
    const provider = getProvider(this.providers, providerId);
    if (!provider.authMethods.includes(AuthType.API_KEY)) {
      throw new Error(`${providerId} can't be connected with an API key`);
    }
    const enable = sourcesToEnable(provider, options);
    const key = apiKey.trim();
    if (key === '') throw new Error('An API key is required');

    const credentials: ApiKeyCredentials = { type: AuthType.API_KEY, apiKey: key };
    // the network call comes first, so a rejected key leaves nothing behind
    const account = await provider.getAccount(toAuth(credentials));
    return this.store(provider, credentials, account, enable);
  }

  /**
   * Runs the provider's OAuth flow in the system browser, then stores the integration exactly as
   * connectWithApiKey does. Resolves when the flow ends; `options.signal` cancels it while it waits
   * on the browser. Only one OAuth connect runs at a time in a workspace: a second one throws
   * ConnectInProgressError. Nothing is written unless the flow and the account query succeed.
   */
  async connectWithOAuth(
    providerId: Provider,
    options: OAuthConnectOptions = {},
  ): Promise<Integration> {
    const provider = getProvider(this.providers, providerId);
    const config = provider.oauth;
    if (!config || !provider.authMethods.includes(AuthType.OAUTH)) {
      throw new Error(`${providerId} can't be connected with OAuth`);
    }
    if (!this.oauth) throw new Error('No OAuth client is configured');
    const enable = sourcesToEnable(provider, options);

    if (this.connecting) throw new ConnectInProgressError();
    this.connecting = true;
    try {
      const signal = options.signal ?? new AbortController().signal;
      const tokens = await this.oauth.authorize(config, { signal });
      if (!tokens.refreshToken) {
        throw new IntegrationAuthError(`${providerId} issued no refresh token`);
      }
      const credentials: OAuthCredentials = {
        type: AuthType.OAUTH,
        accessToken: tokens.accessToken,
        refreshToken: tokens.refreshToken,
        expiresAt: tokens.expiresAt ?? null,
      };
      const account = await provider.getAccount(toAuth(credentials));
      return await this.store(provider, credentials, account, enable);
    } finally {
      this.connecting = false;
    }
  }

  // Stores a validated connection: the integration, its encrypted credentials and one source per
  // type the provider supports, in one transaction. The same for every auth method and provider.
  private async store(
    provider: ProviderImpl,
    credentials: Credentials,
    account: ExternalAccount,
    enable: SourceType[],
  ): Promise<Integration> {
    // checked here for a useful message; the unique constraint catches a connect racing this one
    this.assertNotConnected(provider.id, account.accountId, account.label);
    const sealed = await this.credentials.seal(credentials);

    let integrationId: IntegrationId;
    let sources: { sourceId: ExternalSourceId; enabled: boolean }[];
    try {
      ({ integrationId, sources } = this.db.transaction((tx) => {
        const [row] = tx
          .insert(integrations)
          .values({
            provider: provider.id,
            authType: credentials.type,
            accountId: account.accountId,
            accountLabel: account.label,
            status: IntegrationStatus.CONNECTED,
            // the column is not null; save fills it in the same transaction
            credentials: Buffer.alloc(0),
          })
          .returning({ id: integrations.id })
          .all();
        // writes through the same connection, so it commits or rolls back with the insert
        this.credentials.save(row.id, sealed);

        const inserted = tx
          .insert(externalSources)
          .values(
            provider.supports.map((sourceType) => ({
              integrationId: row.id,
              sourceType,
              enabled: enable.includes(sourceType),
            })),
          )
          .returning({ id: externalSources.id, enabled: externalSources.enabled })
          .all();
        return {
          integrationId: row.id,
          sources: inserted.map((source) => ({ sourceId: source.id, enabled: source.enabled })),
        };
      }));
    } catch (error) {
      if (isUniqueViolation(error)) {
        this.assertNotConnected(provider.id, account.accountId, account.label);
      }
      throw error;
    }

    this.emit({ type: 'connected', integrationId, sources });
    return this.getById(integrationId);
  }

  /**
   * Disabling switches the integration and all of its sources off, so a disabled integration never
   * has a source that looks on. Enabling a disabled one reconnects it and switches its sources back
   * on: those in `options.enable`, or all of them by default. Sources resume from their cursors.
   *
   * One in needs_reauth can be disabled. Enabling it while it needs re-authentication changes
   * nothing: only a reconnect clears that.
   */
  async setEnabled(
    id: IntegrationId,
    enabled: boolean,
    options: EnableOptions = {},
  ): Promise<Integration> {
    const row = this.db
      .select({ status: integrations.status })
      .from(integrations)
      .where(eq(integrations.id, id))
      .get();
    if (!row) throw new NotFoundError(id);

    const sources = this.db
      .select({ id: externalSources.id, sourceType: externalSources.sourceType })
      .from(externalSources)
      .where(eq(externalSources.integrationId, id))
      .all();
    const enable = options.enable ?? sources.map((source) => source.sourceType);
    const unknown = enable.filter((type) => !sources.some((source) => source.sourceType === type));
    if (unknown.length > 0) {
      throw new Error(`${id} has no ${unknown.join(', ')} source`);
    }

    if (enabled && row.status !== IntegrationStatus.DISABLED) return this.getById(id);
    if (!enabled && row.status === IntegrationStatus.DISABLED) return this.getById(id);

    const status = enabled ? IntegrationStatus.CONNECTED : IntegrationStatus.DISABLED;
    const toggled = this.db.transaction((tx) => {
      tx.update(integrations).set({ status }).where(eq(integrations.id, id)).run();
      const ids = enabled
        ? sources.filter((source) => enable.includes(source.sourceType)).map((source) => source.id)
        : sources.map((source) => source.id);
      if (ids.length === 0) return [];
      return tx
        .update(externalSources)
        .set({ enabled })
        .where(and(inArray(externalSources.id, ids), eq(externalSources.enabled, !enabled)))
        .returning({ id: externalSources.id })
        .all();
    });

    this.emit({ type: 'status_changed', integrationId: id, status });
    for (const source of toggled) {
      this.emit({ type: 'source_changed', integrationId: id, sourceId: source.id, enabled });
    }
    return this.getById(id);
  }

  /**
   * Switches one source on or off. A source of a disabled integration can't be switched on: enable
   * the integration, which can switch on just this source through its `enable` option.
   */
  async setSourceEnabled(sourceId: ExternalSourceId, enabled: boolean): Promise<ExternalSource> {
    const row = this.db
      .select()
      .from(externalSources)
      .where(eq(externalSources.id, sourceId))
      .get();
    if (!row) throw new NotFoundError(sourceId);

    if (row.enabled === enabled) return toSource(row);
    if (enabled) {
      const integration = this.db
        .select({ status: integrations.status })
        .from(integrations)
        .where(eq(integrations.id, row.integrationId))
        .get();
      if (integration?.status === IntegrationStatus.DISABLED) {
        throw new IntegrationDisabledError(row.integrationId);
      }
    }

    const [updated] = this.db
      .update(externalSources)
      .set({ enabled })
      .where(eq(externalSources.id, sourceId))
      .returning()
      .all();
    this.emit({
      type: 'source_changed',
      integrationId: row.integrationId,
      sourceId,
      enabled,
    });
    return toSource(updated);
  }

  /** the stored sync state of a source and its integration, for the sync engine */
  getSyncTarget(sourceId: ExternalSourceId): SyncTarget {
    const row = this.db
      .select({
        integrationId: externalSources.integrationId,
        provider: integrations.provider,
        status: integrations.status,
        sourceType: externalSources.sourceType,
        enabled: externalSources.enabled,
        cursor: externalSources.cursor,
        config: externalSources.config,
        initialSyncCompletedAt: externalSources.initialSyncCompletedAt,
        retryAt: externalSources.retryAt,
        consecutiveFailures: externalSources.consecutiveFailures,
      })
      .from(externalSources)
      .innerJoin(integrations, eq(integrations.id, externalSources.integrationId))
      .where(eq(externalSources.id, sourceId))
      .get();
    if (!row) throw new NotFoundError(sourceId);
    return row;
  }

  /**
   * Stores a source's cursor, and when a full pass just ended, when it did. Synchronous and
   * emits nothing, so the engine can call it inside the transaction that applies the page: the
   * cursor commits or rolls back with it.
   */
  saveCursor(
    sourceId: ExternalSourceId,
    cursor: unknown,
    options: { initialSyncCompletedAt?: Date } = {},
  ): void {
    const result = this.db
      .update(externalSources)
      .set({
        cursor,
        ...(options.initialSyncCompletedAt && {
          initialSyncCompletedAt: options.initialSyncCompletedAt,
        }),
      })
      .where(eq(externalSources.id, sourceId))
      .run();
    if (result.changes === 0) throw new NotFoundError(sourceId);
  }

  /**
   * Records how a sync run ended. Success sets lastSyncedAt and clears the error, the failure
   * count and any retry time. Failure stores the error and retryAt, and counts toward backoff
   * unless `countsAsFailure` is false. A source deleted while its run was in flight is ignored.
   */
  recordSyncOutcome(sourceId: ExternalSourceId, outcome: SyncOutcome): void {
    const [row] = this.db
      .update(externalSources)
      .set(
        outcome.ok
          ? { lastSyncedAt: outcome.at, lastError: null, consecutiveFailures: 0, retryAt: null }
          : {
              lastError: outcome.error,
              retryAt: outcome.retryAt ?? null,
              ...(outcome.countsAsFailure && {
                consecutiveFailures: sql`${externalSources.consecutiveFailures} + 1`,
              }),
            },
      )
      .where(eq(externalSources.id, sourceId))
      .returning()
      .all();
    if (!row) return;
    this.emit({
      type: 'sync_status_changed',
      integrationId: row.integrationId,
      sourceId,
      source: toSource(row),
    });
  }

  /**
   * Moves a connected integration to needs_reauth after its credentials were rejected. Its sources
   * keep their flags and cursors; they stop syncing until a reconnect. A disabled integration stays
   * disabled.
   */
  markNeedsReauth(id: IntegrationId): void {
    const result = this.db
      .update(integrations)
      .set({ status: IntegrationStatus.NEEDS_REAUTH })
      .where(and(eq(integrations.id, id), eq(integrations.status, IntegrationStatus.CONNECTED)))
      .run();
    if (result.changes === 0) return;
    this.emit({
      type: 'status_changed',
      integrationId: id,
      status: IntegrationStatus.NEEDS_REAUTH,
    });
  }

  // returns a function that unsubscribes the listener
  onChange(listener: IntegrationChangeListener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  private emit(change: IntegrationChange): void {
    // the change is already committed, so a failing listener must not fail the call or the others
    for (const listener of [...this.listeners]) {
      try {
        listener(change);
      } catch (error) {
        console.error('An integration change listener threw:', error);
      }
    }
  }

  private assertNotConnected(provider: Provider, accountId: string, accountLabel: string): void {
    const existing = this.db
      .select({ id: integrations.id })
      .from(integrations)
      .where(and(eq(integrations.provider, provider), eq(integrations.accountId, accountId)))
      .get();
    if (existing) throw new IntegrationAlreadyConnectedError(provider, accountLabel, existing.id);
  }

  private withSources(rows: IntegrationRow[]): Integration[] {
    if (rows.length === 0) return [];
    const sources = this.db
      .select()
      .from(externalSources)
      .where(
        inArray(
          externalSources.integrationId,
          rows.map((row) => row.id),
        ),
      )
      .orderBy(asc(externalSources.sourceType))
      .all();

    return rows.map((row) => ({
      id: row.id,
      provider: row.provider,
      authType: row.authType,
      accountLabel: row.accountLabel,
      status: row.status,
      sources: sources.filter((source) => source.integrationId === row.id).map(toSource),
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    }));
  }
}

// the types a connect switches on: those asked for, all supported ones by default
function sourcesToEnable(provider: ProviderImpl, options: ConnectOptions): SourceType[] {
  const enable = options.enable ?? provider.supports;
  const unsupported = enable.filter((sourceType) => !provider.supports.includes(sourceType));
  if (unsupported.length > 0) {
    throw new Error(`${provider.id} can't serve as a source for ${unsupported.join(', ')}`);
  }
  return enable;
}

function toSource(row: SourceRow): ExternalSource {
  return {
    id: row.id,
    sourceType: row.sourceType,
    enabled: row.enabled,
    initialSyncCompleted: row.initialSyncCompletedAt !== null,
    lastSyncedAt: row.lastSyncedAt,
    lastError: row.lastError,
    retryAt: row.retryAt,
  };
}

// drizzle wraps driver errors, so the SQLite code is looked for down the cause chain
function isUniqueViolation(error: unknown): boolean {
  for (let current = error; current instanceof Error; current = current.cause) {
    if ((current as { code?: unknown }).code === 'SQLITE_CONSTRAINT_UNIQUE') return true;
  }
  return false;
}
