import { ExternalSourceId, IntegrationId } from '@common/ids';
import { externalSources, integrations } from '@main/db/schema/integrations';
import { eq, sql } from 'drizzle-orm';
import { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import { toSource } from '../integrations/service';
import { ExternalSource, IntegrationStatus, Provider, SourceType } from '../integrations/types';
import { ChangeListener, ChangeListeners } from '../shared/changes';
import { NotFoundError } from '../shared/errors';
import { SyncSkipReason } from './types';

// What the sync engine needs to start a run: the source's stored state and its integration's.
// The cursor is the raw JSON; the engine validates it with the syncer's schema.
export interface SyncTarget {
  integrationId: IntegrationId;
  provider: Provider;
  status: IntegrationStatus;
  sourceType: SourceType;
  enabled: boolean;
  cursor: unknown;
  initialSyncCompletedAt: Date | null;
  retryAt: Date | null;
  // failed runs in a row; the scheduler backs off by it
  consecutiveFailures: number;
}

// Why nothing may ask the provider for a source now, or null when it may: the source or its
// integration is off, the integration needs re-authentication, or the provider's retry time from a
// rate-limited run has not passed. A run is skipped for it, and so is any other call for the
// source, such as a reattach.
export function syncSkipReason(target: SyncTarget, now: Date): SyncSkipReason | null {
  if (target.status === IntegrationStatus.NEEDS_REAUTH) return SyncSkipReason.NEEDS_REAUTH;
  if (target.status === IntegrationStatus.DISABLED) return SyncSkipReason.INTEGRATION_DISABLED;
  if (!target.enabled) return SyncSkipReason.SOURCE_DISABLED;
  if (target.retryAt && target.retryAt.getTime() > now.getTime()) {
    return SyncSkipReason.RATE_LIMITED;
  }
  return null;
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

// a sync run ended and recorded its outcome on its source: lastSyncedAt, lastError, retryAt
export interface SyncStatusChange {
  type: 'sync_status_changed';
  integrationId: IntegrationId;
  sourceId: ExternalSourceId;
  source: ExternalSource;
}

export type SyncStatusListener = ChangeListener<SyncStatusChange>;

/**
 * The sync state kept on external_sources: each source's cursor and how its runs went. Only the
 * sync engine writes it; IntegrationService owns the rest of the table (which sources exist and
 * whether they are on).
 *
 * The writes are synchronous through the workspace's one connection, so a call made inside a
 * transaction joins it: the engine saves a page's cursor in the transaction that applies the page,
 * and both commit or roll back together.
 */
export class SyncStateManager {
  // the outcome is already committed, so a failing listener must not fail the run or the others
  private readonly changes = new ChangeListeners<SyncStatusChange>('Sync status');

  constructor(private readonly db: BetterSQLite3Database) {}

  /** the stored sync state of a source and its integration */
  getSyncTarget(sourceId: ExternalSourceId): SyncTarget {
    const row = this.db
      .select({
        integrationId: externalSources.integrationId,
        provider: integrations.provider,
        status: integrations.status,
        sourceType: externalSources.sourceType,
        enabled: externalSources.enabled,
        cursor: externalSources.cursor,
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
   * Stores a source's cursor, and when a full pass just ended, when it did. Emits nothing, so the
   * engine can call it inside the transaction that applies the page: the cursor commits or rolls
   * back with it.
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
    this.changes.emit({
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

  // returns a function that unsubscribes the listener
  onChange(listener: SyncStatusListener): () => void {
    return this.changes.add(listener);
  }
}
