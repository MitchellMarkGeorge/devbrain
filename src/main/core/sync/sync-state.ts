import { ExternalSourceId, IntegrationId } from '@common/ids';
import { externalSources, integrations } from '@main/db/schema/integrations';
import { eq, sql } from 'drizzle-orm';
import { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import { toSource } from '../integrations/service';
import { ExternalSource, IntegrationStatus, Provider, SourceType } from '../integrations/types';
import { NotFoundError } from '../shared/errors';

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

// a sync run ended and recorded its outcome on its source: lastSyncedAt, lastError, retryAt
export interface SyncStatusChange {
  type: 'sync_status_changed';
  integrationId: IntegrationId;
  sourceId: ExternalSourceId;
  source: ExternalSource;
}

export type SyncStatusListener = (change: SyncStatusChange) => void;

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
  private readonly listeners = new Set<SyncStatusListener>();

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

  // returns a function that unsubscribes the listener
  onChange(listener: SyncStatusListener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  private emit(change: SyncStatusChange): void {
    // the outcome is already committed, so a failing listener must not fail the run or the others
    for (const listener of [...this.listeners]) {
      try {
        listener(change);
      } catch (error) {
        console.error('A sync status listener threw:', error);
      }
    }
  }
}
