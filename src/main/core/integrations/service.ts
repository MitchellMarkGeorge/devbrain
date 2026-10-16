import { ExternalSourceId, IntegrationId } from '@common/ids';
import { externalSources, integrations } from '@main/db/schema/integrations';
import { and, asc, eq, inArray } from 'drizzle-orm';
import { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import {
  ConnectInProgressError,
  IntegrationAccountMismatchError,
  IntegrationAlreadyConnectedError,
  IntegrationAuthError,
  IntegrationDisabledError,
  InvalidInputError,
  NotFoundError,
  OAuthUnavailableError,
  ProviderUnavailableError,
  UnsupportedByProviderError,
} from '../shared/errors';
import { REVOKE_TIMEOUT_MS } from '../sync/constants';
import { SyncEntityType } from '../sync/types';
import { ChangeListener, ChangeListeners } from '../shared/changes';
import { toAuth } from './auth';
import { CredentialStore } from './credential-store';
import { ApiKeyCredentials, Credentials, OAuthCredentials, PendingRevoke } from './credentials';
import {
  applyDisconnect,
  countPlan,
  DisconnectCounts,
  DisconnectedItems,
  planDisconnect,
} from './disconnect';
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

// What changed, for in-process subscribers: the scheduler starts and stops syncs from these, the
// workspace keeps search in step, and the IPC layer will forward them to the renderer. Ids and
// flags only, never credentials.
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
  // The integration is gone, with its sources, the items it deleted and the entity types whose rows
  // changed. Sent as the last step of the removal, inside its transaction: a listener's synchronous
  // database writes (search dropping the ids) commit with it, and anything asynchronous runs after
  // the commit
  | {
      type: 'disconnected';
      integrationId: IntegrationId;
      // already deleted, so they can't be looked up from here
      sourceIds: ExternalSourceId[];
      deleted: DisconnectedItems;
      changed: SyncEntityType[];
    };

export type IntegrationChangeListener = ChangeListener<IntegrationChange>;

// what a reconnect authenticates with: a new API key, or the provider's OAuth flow run again
export type ReconnectWith =
  | { type: AuthType.API_KEY; apiKey: string }
  | { type: AuthType.OAUTH; signal?: AbortSignal };

export interface DisconnectOptions {
  // true keeps every synced item as a detached local copy; false (the default choice in the
  // dialog) deletes those nothing of the user's points at
  keepLocalCopies: boolean;
}

export interface DisconnectResult extends DisconnectCounts {
  changed: SyncEntityType[];
  // whether the provider confirmed the grant revoked; false for an API key, which has nothing to
  // revoke, and when revoking failed or timed out
  revoked: boolean;
}

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

export interface IntegrationServiceOptions {
  credentials: CredentialStore;
  providers: ProviderRegistry;
  // runs connectWithOAuth's browser flow; without one, connecting through OAuth is refused
  oauth?: OAuthClient;
  signal?: AbortSignal;
}

type IntegrationRow = typeof integrations.$inferSelect;
type SourceRow = typeof externalSources.$inferSelect;

// IntegrationService's public API. Code that only needs a workspace's integrations, such as
// SyncScheduler, depends on this rather than the class, and tests can pass their own.
export interface BaseIntegrationService {
  // every integration in the workspace, oldest first, each with its sources
  list(): Promise<Integration[]>;
  getById(id: IntegrationId): Promise<Integration>;
  connectWithApiKey(
    providerId: Provider,
    apiKey: string,
    options?: ConnectOptions,
  ): Promise<Integration>;
  connectWithOAuth(providerId: Provider, options?: OAuthConnectOptions): Promise<Integration>;
  setEnabled(id: IntegrationId, enabled: boolean, options?: EnableOptions): Promise<Integration>;
  setSourceEnabled(sourceId: ExternalSourceId, enabled: boolean): Promise<ExternalSource>;
  reconnect(id: IntegrationId, using: ReconnectWith): Promise<Integration>;
  previewDisconnect(id: IntegrationId): Promise<DisconnectCounts>;
  disconnect(id: IntegrationId, options: DisconnectOptions): Promise<DisconnectResult>;
  markNeedsReauth(id: IntegrationId): void;
  // returns a function that unsubscribes the listener
  onChange(listener: IntegrationChangeListener): () => void;
}

// Connect, enable, disable, reconnect and disconnect. Owns the integrations and external_sources
// tables (a disconnect also deletes or detaches the mirrored rows); credentials go
// through CredentialStore and never appear on what this returns.
export class IntegrationService implements BaseIntegrationService {
  private readonly credentials: CredentialStore;
  private readonly providers: ProviderRegistry;
  private readonly oauth: OAuthClient | null;
  // a failing listener must not fail the call or the others; `disconnected` is sent inside its
  // transaction, and the removal stands even if a listener throws
  private readonly changes = new ChangeListeners<IntegrationChange>('Integration');
  // set while an OAuth connect waits on the browser; one flow per workspace at a time
  private connecting = false;
  private readonly signal?: AbortSignal;

  constructor(
    private readonly db: BetterSQLite3Database,
    options: IntegrationServiceOptions,
  ) {
    this.credentials = options.credentials;
    this.providers = options.providers;
    this.oauth = options.oauth ?? null;
    this.signal = options.signal;
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
      throw new UnsupportedByProviderError(
        providerId,
        `${providerId} can't be connected with an API key`,
      );
    }
    const enable = sourcesToEnable(provider, options);

    // the network call comes first, so a rejected key leaves nothing behind
    const { credentials, account } = await this.authenticate(provider, {
      type: AuthType.API_KEY,
      apiKey,
    });
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
    if (!provider.oauth || !provider.authMethods.includes(AuthType.OAUTH)) {
      throw new UnsupportedByProviderError(
        providerId,
        `${providerId} can't be connected with OAuth`,
      );
    }
    if (!this.oauth) throw new OAuthUnavailableError('No OAuth client is configured');
    const enable = sourcesToEnable(provider, options);
    const { credentials, account } = await this.authenticate(provider, {
      type: AuthType.OAUTH,
      signal: options.signal,
    });
    return this.store(provider, credentials, account, enable);
  }

  /**
   * Re-authenticates an integration, usually one in needs_reauth, keeping its row, sources and
   * cursors: with a new API key, or by running the provider's OAuth flow again. The credentials
   * are validated through the provider's account query first. Credentials for another account are
   * rejected with IntegrationAccountMismatchError and change nothing.
   *
   * On success the new credentials are stored and the status becomes connected, so a scheduler
   * listening for status_changed starts syncing again from the saved cursors. A disabled
   * integration stays disabled with the new credentials, as enabling it is the user's call.
   */
  async reconnect(id: IntegrationId, using: ReconnectWith): Promise<Integration> {
    this.signal?.throwIfAborted();
    const row = this.db.select().from(integrations).where(eq(integrations.id, id)).get();
    if (!row) throw new NotFoundError(id);
    const provider = getProvider(this.providers, row.provider);

    const { credentials, account } = await this.authenticate(provider, using);
    if (account.accountId !== row.accountId) {
      throw new IntegrationAccountMismatchError(id, row.accountLabel, account.label);
    }
    const sealed = await this.credentials.seal(credentials);
    this.signal?.throwIfAborted();

    const status =
      row.status === IntegrationStatus.DISABLED
        ? IntegrationStatus.DISABLED
        : IntegrationStatus.CONNECTED;
    this.db.transaction((tx) => {
      // a reconnect may switch auth method, e.g. from an API key to OAuth
      tx.update(integrations)
        .set({ authType: credentials.type, accountLabel: account.label, status })
        .where(eq(integrations.id, id))
        .run();
      this.credentials.save(id, sealed);
    });

    if (status === IntegrationStatus.CONNECTED) {
      this.changes.emit({ type: 'status_changed', integrationId: id, status });
    }
    return this.getById(id);
  }

  // Gets credentials from the user, by API key or the provider's OAuth flow, and validates them
  // with the provider's account query. Writes nothing. Only one OAuth flow runs at a time in a
  // workspace: a second one throws ConnectInProgressError.
  private async authenticate(
    provider: ProviderImpl,
    using: ReconnectWith,
  ): Promise<{ credentials: Credentials; account: ExternalAccount }> {
    this.signal?.throwIfAborted();
    if (using.type === AuthType.API_KEY) {
      if (!provider.authMethods.includes(AuthType.API_KEY)) {
        throw new UnsupportedByProviderError(
          provider.id,
          `${provider.id} can't be connected with an API key`,
        );
      }
      const key = using.apiKey.trim();
      if (key === '') throw new InvalidInputError('An API key is required');
      const credentials: ApiKeyCredentials = { type: AuthType.API_KEY, apiKey: key };
      const account = await provider.getAccount(toAuth(credentials), { signal: this.signal });
      this.signal?.throwIfAborted();
      return { credentials, account };
    }

    const config = provider.oauth;
    if (!config || !provider.authMethods.includes(AuthType.OAUTH)) {
      throw new UnsupportedByProviderError(
        provider.id,
        `${provider.id} can't be connected with OAuth`,
      );
    }
    if (!this.oauth) throw new OAuthUnavailableError('No OAuth client is configured');
    if (this.connecting) throw new ConnectInProgressError();
    this.connecting = true;
    try {
      const signals = [using.signal, this.signal].filter((s): s is AbortSignal => !!s);
      const signal = AbortSignal.any(signals);
      const tokens = await this.oauth.authorize(config, { signal });
      signal.throwIfAborted();
      if (!tokens.refreshToken) {
        throw new IntegrationAuthError(`${provider.id} issued no refresh token`);
      }
      const credentials: OAuthCredentials = {
        type: AuthType.OAUTH,
        accessToken: tokens.accessToken,
        refreshToken: tokens.refreshToken,
        expiresAt: tokens.expiresAt ?? null,
      };
      const account = await provider.getAccount(toAuth(credentials), { signal });
      signal.throwIfAborted();
      return { credentials, account };
    } finally {
      this.connecting = false;
    }
  }

  // Stores a validated connection: the integration, its encrypted credentials and one source per
  // type the provider supports, in one transaction. The same for every auth method and provider:
  // nothing here is specific to a source type (an events source lists its calendars when it first
  // syncs; see EventSyncer).
  private async store(
    provider: ProviderImpl,
    credentials: Credentials,
    account: ExternalAccount,
    enable: SourceType[],
  ): Promise<Integration> {
    this.signal?.throwIfAborted();
    // checked here for a useful message; the unique constraint catches a connect racing this one
    this.assertNotConnected(provider.id, account.accountId, account.label);
    const sealed = await this.credentials.seal(credentials);
    this.signal?.throwIfAborted();

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

    this.changes.emit({ type: 'connected', integrationId, sources });
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
      .select({ status: integrations.status, provider: integrations.provider })
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
      throw new UnsupportedByProviderError(
        row.provider,
        `${id} has no ${unknown.join(', ')} source`,
      );
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

    this.changes.emit({ type: 'status_changed', integrationId: id, status });
    for (const source of toggled) {
      this.changes.emit({
        type: 'source_changed',
        integrationId: id,
        sourceId: source.id,
        enabled,
      });
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
    this.changes.emit({
      type: 'source_changed',
      integrationId: row.integrationId,
      sourceId,
      enabled,
    });
    return toSource(updated);
  }

  /**
   * What disconnecting with "remove synced items" would do: how many mirrored tasks, projects and
   * events would be deleted, and how many kept as local copies. Keeping everything keeps the sum.
   * Reads only; uses the same plan as disconnect, so the two agree.
   */
  async previewDisconnect(id: IntegrationId): Promise<DisconnectCounts> {
    await this.getById(id);
    return countPlan(planDisconnect(this.db, id, { keepLocalCopies: false }));
  }

  /**
   * Disconnects an integration and deletes it.
   *
   * 1. Read the credentials for revoking (see prepareRevoke), before the transaction deletes them.
   * 2. In one transaction: delete or detach the mirrored items (see planDisconnect and
   *    applyDisconnect), clear the credentials and delete the integration. The cascade deletes the
   *    sources and nulls `sourceId` on the surviving links and calendars, which keep their
   *    provider, key and URL for the badge.
   * 3. Emit `disconnected` as the transaction's last step: the workspace drops the deleted ids
   *    from search in the same commit, and the scheduler aborts the sources' runs. A run still
   *    going writes nothing after: its source is gone.
   * 4. Revoke the grant at the provider (see sendRevoke). Syncing has stopped by now, so no run
   *    can meet the revoked token. Best effort: a failure never undoes the disconnect.
   */
  async disconnect(id: IntegrationId, options: DisconnectOptions): Promise<DisconnectResult> {
    const { provider, sources } = await this.getById(id);
    const sourceIds = sources.map((source) => source.id);

    // 1.
    const revoke = await this.prepareRevoke(id, provider);

    // 2. the plan is made inside the transaction, on the rows as they are when it commits
    const { plan, changed } = this.db.transaction((tx) => {
      const plan = planDisconnect(tx, id, options);
      const changed = applyDisconnect(tx, plan);
      this.credentials.clear(id);
      tx.delete(integrations).where(eq(integrations.id, id)).run();
      // 3.
      this.changes.emit({
        type: 'disconnected',
        integrationId: id,
        sourceIds,
        deleted: plan.deleted,
        changed,
      });
      return { plan, changed };
    });

    // 4.
    const revoked = revoke ? await sendRevoke(revoke) : false;
    return { ...countPlan(plan), changed, revoked };
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
    this.changes.emit({
      type: 'status_changed',
      integrationId: id,
      status: IntegrationStatus.NEEDS_REAUTH,
    });
  }

  // returns a function that unsubscribes the listener
  onChange(listener: IntegrationChangeListener): () => void {
    return this.changes.add(listener);
  }

  /**
   * The revocation of the integration's grant, read before disconnect deletes the credentials; see
   * CredentialStore.prepareRevoke. Only a provider that connects through OAuth has a grant to
   * revoke; null for anything else.
   */
  private async prepareRevoke(
    id: IntegrationId,
    providerId: Provider,
  ): Promise<PendingRevoke | null> {
    const config = getProvider(this.providers, providerId).oauth;
    if (!config || !this.oauth) return null;
    return this.credentials.prepareRevoke(id, this.oauth, config);
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
    throw new UnsupportedByProviderError(
      provider.id,
      `${provider.id} can't serve as a source for ${unsupported.join(', ')}`,
    );
  }
  return enable;
}

// Sends a prepared revocation, giving up after REVOKE_TIMEOUT_MS. Resolves whether the provider
// confirmed it; never throws, and logs no more than the error's name, as a message could quote a
// token.
async function sendRevoke(revoke: PendingRevoke): Promise<boolean> {
  const controller = new AbortController();
  // the race bounds the wait even for an OAuth client that ignores the signal
  let timer: NodeJS.Timeout | undefined;
  const timedOut = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      const reason = new ProviderUnavailableError('Revoking timed out');
      controller.abort(reason);
      reject(reason);
    }, REVOKE_TIMEOUT_MS);
  });
  try {
    await Promise.race([revoke(controller.signal), timedOut]);
    return true;
  } catch (error) {
    console.warn(
      'Revoking credentials at the provider failed:',
      error instanceof Error ? error.name : 'unknown error',
    );
    return false;
  } finally {
    clearTimeout(timer);
  }
}

// a source row as the API returns it; also used by SyncStateManager
export function toSource(row: SourceRow): ExternalSource {
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
