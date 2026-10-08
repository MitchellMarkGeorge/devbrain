import { ExternalSourceId, IntegrationId } from '@common/ids';
import { externalSources, integrations } from '@main/db/schema/integrations';
import { and, asc, eq, inArray } from 'drizzle-orm';
import { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import {
  IntegrationAlreadyConnectedError,
  IntegrationDisabledError,
  NotFoundError,
} from '../shared/errors';
import { toAuth } from './auth';
import { CredentialStore } from './credential-store';
import { ApiKeyCredentials } from './credentials';
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
    };

export type IntegrationChangeListener = (change: IntegrationChange) => void;

export interface ConnectOptions {
  // The source types to switch on, from those the provider supports; defaults to all of them.
  // Every supported type still gets a source, created disabled when left out, so turning it on
  // later is setSourceEnabled and needs no reconnect. An empty list connects without syncing.
  enable?: SourceType[];
}

export interface EnableOptions {
  // the source types to switch back on when a disabled integration is enabled; defaults to all
  enable?: SourceType[];
}

export interface IntegrationServiceOptions {
  credentials: CredentialStore;
  providers: ProviderRegistry;
}

type IntegrationRow = typeof integrations.$inferSelect;
type SourceRow = typeof externalSources.$inferSelect;

// Connect, enable and disable. Owns the integrations and external_sources tables; credentials go
// through CredentialStore and never appear on what this returns.
export class IntegrationService {
  private readonly credentials: CredentialStore;
  private readonly providers: ProviderRegistry;
  private readonly listeners = new Set<IntegrationChangeListener>();

  constructor(
    private readonly db: BetterSQLite3Database,
    options: IntegrationServiceOptions,
  ) {
    this.credentials = options.credentials;
    this.providers = options.providers;
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
    const enable = options.enable ?? provider.supports;
    const unsupported = enable.filter((sourceType) => !provider.supports.includes(sourceType));
    if (unsupported.length > 0) {
      throw new Error(`${providerId} can't serve as a source for ${unsupported.join(', ')}`);
    }
    const key = apiKey.trim();
    if (key === '') throw new Error('An API key is required');

    const credentials: ApiKeyCredentials = { type: AuthType.API_KEY, apiKey: key };
    // the network call comes first, so a rejected key leaves nothing behind
    const account = await provider.getAccount(toAuth(credentials));

    // checked here for a useful message; the unique constraint catches a connect racing this one
    this.assertNotConnected(providerId, account.accountId, account.label);
    const sealed = await this.credentials.seal(credentials);

    let integrationId: IntegrationId;
    let sources: { sourceId: ExternalSourceId; enabled: boolean }[];
    try {
      ({ integrationId, sources } = this.db.transaction((tx) => {
        const [row] = tx
          .insert(integrations)
          .values({
            provider: providerId,
            authType: AuthType.API_KEY,
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
        this.assertNotConnected(providerId, account.accountId, account.label);
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

function toSource(row: SourceRow): ExternalSource {
  return {
    id: row.id,
    sourceType: row.sourceType,
    enabled: row.enabled,
    initialSyncCompleted: row.initialSyncCompletedAt !== null,
    lastSyncedAt: row.lastSyncedAt,
    lastError: row.lastError,
  };
}

// drizzle wraps driver errors, so the SQLite code is looked for down the cause chain
function isUniqueViolation(error: unknown): boolean {
  for (let current = error; current instanceof Error; current = current.cause) {
    if ((current as { code?: unknown }).code === 'SQLITE_CONSTRAINT_UNIQUE') return true;
  }
  return false;
}
