import { CalendarId, ExternalSourceId, IntegrationId } from '@common/ids';
import { calendars } from '@main/db/schema/calendars';
import { externalSources, integrations } from '@main/db/schema/integrations';
import { and, asc, desc, eq, inArray, sql } from 'drizzle-orm';
import { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import { Calendar } from '../calendars/types';
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
import type { SyncWriter } from '../sync/writer';
import { Auth } from './auth';
import { EventSource, ExternalAccount, Provider as ProviderImpl } from './providers/provider';
import { ProviderRegistry, getProvider } from './providers/registry';
import { googleEventCursorSchema } from './schema';
import {
  AuthType,
  ExternalCalendar,
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
      // an events source's calendar selection changed; the added calendars want a sync, and the
      // removed ones' events are already gone
      type: 'calendars_changed';
      integrationId: IntegrationId;
      sourceId: ExternalSourceId;
      added: CalendarId[];
      removed: CalendarId[];
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
  // removes a deselected calendar's events; without one, setCalendars can only add calendars
  writer?: SyncWriter;
}

type IntegrationRow = typeof integrations.$inferSelect;
type SourceRow = typeof externalSources.$inferSelect;

// Connect, enable and disable. Owns the integrations and external_sources tables; credentials go
// through CredentialStore and never appear on what this returns.
export class IntegrationService {
  private readonly credentials: CredentialStore;
  private readonly providers: ProviderRegistry;
  private readonly oauth: OAuthClient | null;
  private readonly writer: SyncWriter | null;
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
    this.writer = options.writer ?? null;
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
  // type the provider supports, in one transaction. The same for every auth method and provider:
  // nothing here is specific to a source type (an events source lists its calendars when it first
  // syncs; see refreshCalendars).
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

  /**
   * The calendars of an events source, as rows of DevBrain's calendars table: each with whether it
   * syncs (selected) and whether it is shown (visible). For the calendar picker. Asks the provider
   * for its external calendars first and stores them, so a calendar shared since appears (not
   * selected) and names, colours and zones are current; needs a working connection. The first
   * listing of a source selects its primary calendar. A calendar the account no longer lists keeps
   * its row.
   */
  async listCalendars(sourceId: ExternalSourceId): Promise<Calendar[]> {
    const { integrationId, events } = this.eventsSource(sourceId);
    const listed = await this.withAuth(integrationId, (auth) => events.listExternalCalendars(auth));
    this.storeListedCalendars(sourceId, listed);
    return this.calendarsOf(sourceId);
  }

  /**
   * The calendars a sync run of an events source works on, listed fresh. For the sync engine, at
   * the start of every run, with the run's auth; a provider keeps nothing between calls, so this
   * is the run's only listing.
   *
   * Asks the provider for the account's external calendars (listExternalCalendars) and stores
   * them as rows of the calendars table, as listCalendars does: new ones inserted (the source's
   * first listing selects the primary calendar, later ones start unselected), existing ones
   * brought up to date, selection and visibility left alone. Returns the selected rows the account
   * still lists, with their current name, colour and zone, and whether any row was inserted or
   * changed. A selected calendar it no longer lists keeps its row, but is left out, so it cannot
   * fail the run.
   *
   * Connecting stores no calendars, so a source whose events are never switched on never asks.
   */
  async refreshCalendars(
    sourceId: ExternalSourceId,
    auth: Auth,
  ): Promise<{ calendars: Calendar[]; changed: boolean }> {
    const { events } = this.eventsSource(sourceId);
    const listed = await events.listExternalCalendars(auth);
    const changed = this.storeListedCalendars(sourceId, listed);
    const listedIds = new Set(listed.map((calendar) => calendar.id));
    const calendars = this.calendarsOf(sourceId).filter(
      (row) => row.selected && row.externalId !== null && listedIds.has(row.externalId),
    );
    return { calendars, changed };
  }

  /**
   * Sets which calendars of an events source sync, by their ids as listCalendars returns them.
   * Works offline.
   *
   * An added calendar has no sync token, so the next run gives it, and only it, a full pass. A
   * removed one loses its token, so selecting it again later is a full pass too, and its events go
   * by the removal rule: deleted, or kept and hidden where a note or task links to them. Its row
   * stays, unselected. All in one transaction. A sync run in flight writes nothing more once this
   * commits; see the engine.
   */
  async setCalendars(sourceId: ExternalSourceId, calendarIds: CalendarId[]): Promise<Calendar[]> {
    const { integrationId } = this.eventsSource(sourceId);
    const rows = this.calendarsOf(sourceId);
    const wanted = new Set(calendarIds);
    const unknown = [...wanted].filter((id) => !rows.some((row) => row.id === id));
    if (unknown.length > 0) {
      throw new Error(`${sourceId} has no calendar ${unknown.join(', ')}`);
    }
    const added = rows.filter((row) => !row.selected && wanted.has(row.id));
    const removed = rows.filter((row) => row.selected && !wanted.has(row.id));

    if (added.length > 0 || removed.length > 0) {
      const writer = this.writer;
      if (removed.length > 0 && !writer) throw new Error('No sync writer is configured');
      this.db.transaction((tx) => {
        const select = (ids: CalendarId[], selected: boolean) => {
          if (ids.length > 0) {
            tx.update(calendars).set({ selected }).where(inArray(calendars.id, ids)).run();
          }
        };
        select(
          added.map((row) => row.id),
          true,
        );
        select(
          removed.map((row) => row.id),
          false,
        );
        const source = tx
          .select({ cursor: externalSources.cursor })
          .from(externalSources)
          .where(eq(externalSources.id, sourceId))
          .get();
        tx.update(externalSources)
          .set({
            cursor: withoutCalendars(
              source?.cursor,
              removed.flatMap((row) => row.externalId ?? []),
            ),
          })
          .where(eq(externalSources.id, sourceId))
          .run();
        // the writer's own transaction becomes a savepoint inside this one
        for (const row of removed) writer!.removeCalendarEvents(sourceId, row.id);
      });
      this.emit({
        type: 'calendars_changed',
        integrationId,
        sourceId,
        added: added.map((row) => row.id),
        removed: removed.map((row) => row.id),
      });
    }
    return this.calendarsOf(sourceId);
  }

  /**
   * The provider ids of an events source's selected calendars, in the order a run visits them:
   * the primary first, then by name. What the engine tells the provider to sync.
   */
  selectedCalendarExternalIds(sourceId: ExternalSourceId): string[] {
    return this.calendarsOf(sourceId)
      .filter((row) => row.selected && row.externalId !== null)
      .map((row) => row.externalId!);
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
   * Records that a reconcile pass finished. Called after recordSyncOutcome for the same run, which
   * already told subscribers the run ended, so this emits nothing. A source deleted while its run
   * was in flight is ignored.
   */
  markReconciled(sourceId: ExternalSourceId, at: Date): void {
    this.db
      .update(externalSources)
      .set({ lastReconciledAt: at })
      .where(eq(externalSources.id, sourceId))
      .run();
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

  // an events source and its provider's EventSource
  private eventsSource(sourceId: ExternalSourceId): {
    integrationId: IntegrationId;
    events: EventSource;
  } {
    const row = this.db
      .select({
        integrationId: externalSources.integrationId,
        sourceType: externalSources.sourceType,
        provider: integrations.provider,
      })
      .from(externalSources)
      .innerJoin(integrations, eq(integrations.id, externalSources.integrationId))
      .where(eq(externalSources.id, sourceId))
      .get();
    if (!row) throw new NotFoundError(sourceId);
    const events = getProvider(this.providers, row.provider).events;
    if (row.sourceType !== SourceType.EVENTS || !events) {
      throw new Error(`${sourceId} is not an events source`);
    }
    return { integrationId: row.integrationId, events };
  }

  // Stores the external calendars a provider listed (listExternalCalendars) as rows of the
  // calendars table for an events source. The first listing selects the primary calendar, so a
  // new source syncs it without being asked; a calendar that appears later starts unselected.
  //
  // New ones are inserted; existing ones get their name, colour, zone and primary flag, their
  // selection and visibility left alone. Says whether any row was inserted or changed.
  private storeListedCalendars(sourceId: ExternalSourceId, listed: ExternalCalendar[]): boolean {
    return this.db.transaction((tx) => {
      const existing = new Map(
        tx
          .select()
          .from(calendars)
          .where(eq(calendars.sourceId, sourceId))
          .all()
          .map((row) => [row.externalId, row]),
      );
      const first = existing.size === 0;
      let changed = false;
      for (const calendar of listed) {
        const fields = {
          name: calendar.name,
          color: calendar.color,
          timeZone: calendar.timeZone,
          isPrimary: calendar.primary,
        };
        const row = existing.get(calendar.id);
        if (!row) {
          tx.insert(calendars)
            .values({
              ...fields,
              sourceId,
              externalId: calendar.id,
              selected: first && calendar.primary,
            })
            .run();
          changed = true;
        } else if (
          (Object.keys(fields) as (keyof typeof fields)[]).some((k) => row[k] !== fields[k])
        ) {
          tx.update(calendars).set(fields).where(eq(calendars.id, row.id)).run();
          changed = true;
        }
      }
      return changed;
    });
  }

  // a source's calendars: the primary first, then by name
  private calendarsOf(sourceId: ExternalSourceId): Calendar[] {
    return this.db
      .select()
      .from(calendars)
      .where(eq(calendars.sourceId, sourceId))
      .orderBy(desc(calendars.isPrimary), asc(calendars.name), asc(calendars.id))
      .all();
  }

  // a provider call outside a sync run: rejected credentials need a reconnect just the same
  private async withAuth<T>(integrationId: IntegrationId, call: (auth: Auth) => Promise<T>) {
    try {
      return await call(await this.credentials.getAuth(integrationId));
    } catch (error) {
      if (error instanceof IntegrationAuthError) this.markNeedsReauth(integrationId);
      throw error;
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

// an events cursor without these calendars' tokens and pending visits; one that does not parse is
// left alone, as the engine already treats it as no cursor
function withoutCalendars(cursor: unknown, calendarIds: string[]): unknown {
  const parsed = googleEventCursorSchema.safeParse(cursor);
  if (!parsed.success || calendarIds.length === 0) return cursor;
  const { calendars, pending } = parsed.data;
  return {
    calendars: Object.fromEntries(
      Object.entries(calendars).filter(([id]) => !calendarIds.includes(id)),
    ),
    ...(pending && { pending: pending.filter((id) => !calendarIds.includes(id)) }),
  };
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
