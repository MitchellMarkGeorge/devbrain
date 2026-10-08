import { ExternalSourceId, IntegrationId } from '@common/ids';
import { externalSources, integrations } from '@main/db/schema/integrations';
import { and, asc, eq, inArray } from 'drizzle-orm';
import { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import { IntegrationAlreadyConnectedError, NotFoundError } from '../shared/errors';
import { toAuth } from './auth';
import { CredentialStore } from './credential-store';
import { ApiKeyCredentials } from './credentials';
import { ProviderRegistry, getProvider } from './providers/registry';
import { AuthType, ExternalSource, Integration, IntegrationStatus, Provider } from './types';

// What changed, for in-process subscribers: the scheduler starts and stops syncs from these, and
// the IPC layer will forward them to the renderer. Ids and flags only, never credentials.
export type IntegrationChange =
  | { type: 'connected'; integrationId: IntegrationId; sourceIds: ExternalSourceId[] }
  | { type: 'status_changed'; integrationId: IntegrationId; status: IntegrationStatus }
  | {
      type: 'source_changed';
      integrationId: IntegrationId;
      sourceId: ExternalSourceId;
      enabled: boolean;
    };

export type IntegrationChangeListener = (change: IntegrationChange) => void;

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
   * one enabled source per type the provider supports, in one transaction. A rejected key throws
   * the provider's IntegrationAuthError and writes nothing.
   */
  async connectWithApiKey(providerId: Provider, apiKey: string): Promise<Integration> {
    const provider = getProvider(this.providers, providerId);
    if (!provider.authMethods.includes(AuthType.API_KEY)) {
      throw new Error(`${providerId} can't be connected with an API key`);
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
    let sourceIds: ExternalSourceId[];
    try {
      ({ integrationId, sourceIds } = this.db.transaction((tx) => {
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

        const sources = provider.supports.map((sourceType) => ({
          integrationId: row.id,
          sourceType,
          enabled: true,
        }));
        const inserted = tx
          .insert(externalSources)
          .values(sources)
          .returning({ id: externalSources.id })
          .all();
        return { integrationId: row.id, sourceIds: inserted.map((source) => source.id) };
      }));
    } catch (error) {
      if (isUniqueViolation(error)) {
        this.assertNotConnected(providerId, account.accountId, account.label);
      }
      throw error;
    }

    this.emit({ type: 'connected', integrationId, sourceIds });
    return this.getById(integrationId);
  }

  /**
   * Moves the integration between connected and disabled; its sources keep their own flags and
   * resume from their cursors. One in needs_reauth can be disabled, and enabling it again leaves it
   * in needs_reauth: only a reconnect clears that.
   */
  async setEnabled(id: IntegrationId, enabled: boolean): Promise<Integration> {
    const row = this.db
      .select({ status: integrations.status })
      .from(integrations)
      .where(eq(integrations.id, id))
      .get();
    if (!row) throw new NotFoundError(id);

    const status = nextStatus(row.status, enabled);
    if (status !== row.status) {
      this.db.update(integrations).set({ status }).where(eq(integrations.id, id)).run();
      this.emit({ type: 'status_changed', integrationId: id, status });
    }
    return this.getById(id);
  }

  async setSourceEnabled(sourceId: ExternalSourceId, enabled: boolean): Promise<ExternalSource> {
    const row = this.db
      .select()
      .from(externalSources)
      .where(eq(externalSources.id, sourceId))
      .get();
    if (!row) throw new NotFoundError(sourceId);

    if (row.enabled === enabled) return toSource(row);
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

function nextStatus(current: IntegrationStatus, enabled: boolean): IntegrationStatus {
  if (!enabled) return IntegrationStatus.DISABLED;
  return current === IntegrationStatus.DISABLED ? IntegrationStatus.CONNECTED : current;
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
