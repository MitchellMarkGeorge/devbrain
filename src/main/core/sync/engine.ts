import { ExternalSourceId } from '@common/ids';
import { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import { consoleLogger, errorClass } from '../shared/logger';
import { CredentialStore } from '../integrations/credential-store';
import { IntegrationService } from '../integrations/service';
import { SyncStateManager, SyncTarget, syncSkipReason } from './sync-state';
import { Provider as ProviderImpl } from '../integrations/providers/provider';
import { ProviderRegistry } from '../integrations/providers/registry';
import { SourceType } from '../integrations/types';
import { ChangeListeners } from '../shared/changes';
import { IntegrationAuthError, RateLimitError, SyncPageLimitError } from '../shared/errors';
import { MAX_PAGES_PER_RUN } from './constants';
import { SyncWriter } from './writer';
import { Syncer } from './syncer';
import { TaskSyncer } from './task-syncer';
import { TaskReconciler } from './task-reconciler';
import { EventSyncer } from './event-syncer';
import {
  SyncCursor,
  SyncEntityType,
  SyncLogger,
  SyncMode,
  SyncProgress,
  SyncProgressListener,
  SyncRunOutcome,
  SyncRunResult,
  SyncSkipReason,
  SyncSummary,
} from './types';

export type { SyncLogger } from './types';

export interface SyncEngineOptions {
  // for needs_reauth when a provider rejects the credentials
  integrations: IntegrationService;
  // each source's cursor and run outcomes
  syncState: SyncStateManager;
  credentials: CredentialStore;
  providers: ProviderRegistry;
  writer: SyncWriter;
  logger?: SyncLogger;
  now?: () => Date; // injected for tests
  maxPagesPerRun?: number; // defaults to MAX_PAGES_PER_RUN; lowered in tests
}

export interface RunOptions {
  // checked between pages; an abort stops the run after the last committed page
  signal?: AbortSignal;
}

// SyncEngine's public API. SyncScheduler depends on this rather than the class, and its tests
// pass a fake.
export interface BaseSyncEngine {
  // initial or incremental sync of one source; never throws for a failed run
  runSource(sourceId: ExternalSourceId, options?: RunOptions): Promise<SyncRunResult>;
  // the reconcile pass of one source; skipped for a type without one
  reconcileSource(sourceId: ExternalSourceId, options?: RunOptions): Promise<SyncRunResult>;
  // returns a function that unsubscribes the listener
  onProgress(listener: SyncProgressListener): () => void;
}

/**
 * Runs one sync, or one reconcile pass, for one source: start the syncer for its type, then pull a
 * page, apply it and save the syncer's next cursor in the same transaction, until the syncer says
 * it is done. A crash or abort at any point leaves the last committed page and its cursor, so the
 * next run resumes from there. What differs by source type (its cursor, what a page holds, how it
 * is written, what a run does first, whether it has a reconcile pass) is in the type's Syncer; the
 * engine knows no source type or provider beyond picking the syncer, and has no method for one.
 *
 * Deciding when to run (intervals, backoff, one run per source) is the scheduler's job. The engine
 * only refuses to start a run that cannot or must not talk to the provider, and records how each
 * run ended on its source through SyncStateManager, which tells the scheduler and the renderer.
 */
export class SyncEngine implements BaseSyncEngine {
  private readonly integrations: IntegrationService;
  private readonly syncState: SyncStateManager;
  private readonly credentials: CredentialStore;
  private readonly providers: ProviderRegistry;
  private readonly writer: SyncWriter;
  private readonly logger: SyncLogger;
  private readonly now: () => Date;
  private readonly maxPagesPerRun: number;
  // the page is already committed, so a failing listener must not fail the run or the others
  private readonly progress: ChangeListeners<SyncProgress>;
  // sources with a run in flight; a second run for one of them is skipped
  private readonly running = new Set<ExternalSourceId>();
  // the syncer for each source type, built on its provider's source; null when the provider has
  // none
  private readonly syncers: Record<SourceType, (provider: ProviderImpl) => Syncer | null>;

  constructor(
    private readonly db: BetterSQLite3Database,
    options: SyncEngineOptions,
  ) {
    this.integrations = options.integrations;
    this.syncState = options.syncState;
    this.credentials = options.credentials;
    this.providers = options.providers;
    this.writer = options.writer;
    this.logger = options.logger ?? consoleLogger;
    this.progress = new ChangeListeners<SyncProgress>('Sync progress', {
      // the error class only, like the run's own line: a message could quote item data
      report: (error, progress) =>
        this.logger.error(
          `Sync progress listener threw source=${progress.sourceId} error=${errorClass(error)}`,
        ),
    });
    this.now = options.now ?? (() => new Date());
    this.maxPagesPerRun = options.maxPagesPerRun ?? MAX_PAGES_PER_RUN;
    const reconciler = new TaskReconciler({
      db: this.db,
      syncState: this.syncState,
      credentials: this.credentials,
      providers: this.providers,
      writer: this.writer,
      logger: this.logger,
      now: this.now,
    });
    this.syncers = {
      [SourceType.TASKS]: (provider) =>
        provider.tasks ? new TaskSyncer(this.writer, provider.tasks, reconciler, this.now) : null,
      [SourceType.EVENTS]: (provider) =>
        provider.calendars
          ? new EventSyncer(this.db, this.writer, provider.calendars, this.now)
          : null,
      [SourceType.VERSION_CONTROL]: () => null,
    };
  }

  /**
   * Initial or incremental sync of one tasks or events source, by its stored cursor.
   *
   * 0. An already aborted signal ends the run before anything is read.
   * 1. Load the source and its integration; skip when either is off, the integration needs
   *    re-authentication, or the provider's retry time has not passed.
   * 2. Read the stored cursor; an unreadable one is treated as null, which starts an initial sync.
   * 3. Get auth and start the source type's syncer, then per page: check the signal, pull, check
   *    the signal again (an aborted run discards the page it was waiting on), then apply the page
   *    and save its cursor in one transaction. A page the syncer declines to apply ends the run.
   *    The last page of an initial pass also sets initialSyncCompletedAt; the syncer's cursor
   *    after it is already incremental. A run that reaches the page cap without the syncer
   *    finishing fails, keeping the pages it committed.
   * 4. Record the outcome on the source: success clears the error and failure count; a failure
   *    stores the error, and a rate limit its retry time. Rejected credentials also move the
   *    integration to needs_reauth. A run whose signal was aborted records nothing, even when
   *    something then failed: the failure was cut short by the abort, and a real one recurs.
   *
   * Never throws for a failed run: the result says how it ended, and so does the source. An
   * unknown source id throws NotFoundError.
   */
  async runSource(sourceId: ExternalSourceId, options: RunOptions = {}): Promise<SyncRunResult> {
    const startedAt = Date.now();
    const run = new RunTally(sourceId);
    const finish = (result: Partial<SyncRunResult> & Pick<SyncRunResult, 'outcome'>) => {
      const done = { ...run.result(), ...result, durationMs: Date.now() - startedAt };
      this.logRun(done);
      return done;
    };
    const skip = (skipReason: SyncSkipReason) =>
      finish({ outcome: SyncRunOutcome.SKIPPED, skipReason });

    // an aborted run does no work at all: no reads, no auth, no pull
    if (options.signal?.aborted) return finish({ outcome: SyncRunOutcome.ABORTED });
    if (this.running.has(sourceId)) return skip(SyncSkipReason.ALREADY_RUNNING);
    this.running.add(sourceId);
    try {
      // 1. nothing runs for a source that is off, or for an integration that is off or rejected
      const target = this.syncState.getSyncTarget(sourceId);
      const blocked = syncSkipReason(target, this.now());
      if (blocked) return skip(blocked);
      const syncer = this.getSyncer(target);
      if (!syncer) return skip(SyncSkipReason.UNSUPPORTED);

      // 2.
      const cursor = this.parseCursor(syncer, target);
      run.mode =
        cursor === null || target.initialSyncCompletedAt === null
          ? SyncMode.INITIAL
          : SyncMode.INCREMENTAL;

      try {
        await this.pullPages(sourceId, target, syncer, cursor, run, options.signal);
      } catch (error) {
        // whatever failed after an abort was cut short by it; report the abort, record nothing
        if (options.signal?.aborted) return finish({ outcome: SyncRunOutcome.ABORTED });
        return finish(this.recordFailure(sourceId, target, error));
      }

      if (options.signal?.aborted) return finish({ outcome: SyncRunOutcome.ABORTED });
      // 4. success
      this.syncState.recordSyncOutcome(sourceId, { ok: true, at: this.now() });
      return finish({ outcome: SyncRunOutcome.COMPLETED });
    } finally {
      this.running.delete(sourceId);
    }
  }

  /**
   * The reconcile pass of one source, for a type whose pages cannot see everything that changed
   * (tasks: what TaskReconciler finds). The pass is the syncer's (Syncer.reconcile); the engine
   * runs it as it runs a sync.
   *
   * 0-1. As runSource: an aborted signal, a run in flight, or a source or integration that is off,
   *    needs re-authentication or is rate limited ends it early. So does a source whose type has
   *    no reconcile, or whose initial sync has not finished: before the first full pass, every
   *    item the provider reports would look new.
   * 2. Get auth and let the syncer do the pass's reads. An abort before they finish writes nothing.
   * 3. Apply the pass's writes in one transaction, then report it as one page.
   * 4. Record the outcome as runSource does; success also sets lastReconciledAt.
   *
   * Never throws for a failed run, and an aborted one records nothing, as with runSource.
   */
  async reconcileSource(
    sourceId: ExternalSourceId,
    options: RunOptions = {},
  ): Promise<SyncRunResult> {
    const startedAt = Date.now();
    const run = new RunTally(sourceId);
    run.mode = SyncMode.RECONCILE;
    const finish = (result: Partial<SyncRunResult> & Pick<SyncRunResult, 'outcome'>) => {
      const done = { ...run.result(), ...result, durationMs: Date.now() - startedAt };
      this.logRun(done);
      return done;
    };
    const skip = (skipReason: SyncSkipReason) =>
      finish({ outcome: SyncRunOutcome.SKIPPED, skipReason });

    if (options.signal?.aborted) return finish({ outcome: SyncRunOutcome.ABORTED });
    if (this.running.has(sourceId)) return skip(SyncSkipReason.ALREADY_RUNNING);
    this.running.add(sourceId);
    try {
      // 1.
      const target = this.syncState.getSyncTarget(sourceId);
      const blocked = syncSkipReason(target, this.now());
      if (blocked) return skip(blocked);
      const syncer = this.getSyncer(target);
      if (!syncer?.reconcile) return skip(SyncSkipReason.UNSUPPORTED);
      if (target.initialSyncCompletedAt === null) {
        return skip(SyncSkipReason.INITIAL_SYNC_PENDING);
      }

      try {
        await this.reconcile(sourceId, target, syncer, run, options.signal);
      } catch (error) {
        if (options.signal?.aborted) return finish({ outcome: SyncRunOutcome.ABORTED });
        return finish(this.recordFailure(sourceId, target, error));
      }

      if (options.signal?.aborted) return finish({ outcome: SyncRunOutcome.ABORTED });
      // 4. success
      const at = this.now();
      this.syncState.recordSyncOutcome(sourceId, { ok: true, at });
      this.syncState.markReconciled(sourceId, at);
      return finish({ outcome: SyncRunOutcome.COMPLETED });
    } finally {
      this.running.delete(sourceId);
    }
  }

  // returns a function that unsubscribes the listener
  onProgress(listener: SyncProgressListener): () => void {
    return this.progress.add(listener);
  }

  // 3. the page loop; returns early, with everything so far committed, when the signal aborts
  private async pullPages(
    sourceId: ExternalSourceId,
    target: SyncTarget,
    syncer: Syncer,
    cursor: SyncCursor | null,
    run: RunTally,
    signal: AbortSignal | undefined,
  ): Promise<void> {
    const auth = await this.credentials.getAuth(target.integrationId);
    if (signal?.aborted) return;
    // writes nothing: every write of the run is in sync.apply, below
    const sync = await syncer.start({ sourceId, target, auth, cursor, signal });

    let current = sync.cursor;
    let done = false;
    do {
      // the pages so far are committed, so the next run resumes after them
      if (run.pages >= this.maxPagesPerRun) throw new SyncPageLimitError(this.maxPagesPerRun);
      if (signal?.aborted) return;
      const page = await sync.pull(current);
      // the page arrived after an abort: discard it, so nothing is written after the abort
      if (signal?.aborted) return;

      const completesInitial = run.mode === SyncMode.INITIAL && page.done;
      // the writer's own transaction becomes a savepoint inside this one, so the page and its
      // cursor commit together or not at all
      const summary = this.db.transaction(() => {
        const summary = sync.apply(page);
        if (summary === null) return null;
        this.syncState.saveCursor(sourceId, page.nextCursor, {
          ...(completesInitial && { initialSyncCompletedAt: this.now() }),
        });
        return summary;
      });
      // the syncer declined the page: stop, leaving the stored cursor to the next run
      if (summary === null) return;
      run.addPage(summary, page.skipped);
      this.progress.emit({
        sourceId,
        phase: run.mode!,
        pages: run.pages,
        summary,
        itemsApplied: run.itemsApplied,
      });

      done = page.done;
      current = page.nextCursor;
    } while (!done);
  }

  // 2-3. returns early, having written nothing, when the signal aborts before the write
  private async reconcile(
    sourceId: ExternalSourceId,
    target: SyncTarget,
    syncer: Syncer,
    run: RunTally,
    signal: AbortSignal | undefined,
  ): Promise<void> {
    const auth = await this.credentials.getAuth(target.integrationId);
    if (signal?.aborted) return;
    // 2. reads only
    const pass = await syncer.reconcile!({ sourceId, target, auth, signal });
    if (pass === null || signal?.aborted) return;

    // 3.
    const summary = this.db.transaction(() => pass.apply());
    run.addPage(summary, pass.skipped);
    this.progress.emit({
      sourceId,
      phase: SyncMode.RECONCILE,
      pages: run.pages,
      summary,
      itemsApplied: run.itemsApplied,
    });
  }

  // the syncer for the source's type and provider; null when there is none, and the run is skipped
  private getSyncer(target: SyncTarget): Syncer | null {
    const provider = this.providers.get(target.provider);
    return provider ? this.syncers[target.sourceType](provider) : null;
  }

  // the stored cursor, validated with the syncer's schema; one that does not parse, e.g. written
  // by an older version, is null, which starts a fresh initial sync
  private parseCursor(syncer: Syncer, target: SyncTarget): SyncCursor | null {
    const stored = syncer.cursorSchema.safeParse(target.cursor);
    return stored.success ? stored.data : null;
  }

  // stores the failure on the source, and says how the run ended
  private recordFailure(
    sourceId: ExternalSourceId,
    target: SyncTarget,
    caught: unknown,
  ): Partial<SyncRunResult> & Pick<SyncRunResult, 'outcome'> {
    const error = caught instanceof Error ? caught : new Error(String(caught));

    if (error instanceof RateLimitError) {
      // the retry time is the wait, so a rate limit does not also count toward backoff
      this.syncState.recordSyncOutcome(sourceId, {
        ok: false,
        error: error.message,
        countsAsFailure: false,
        retryAt: error.retryAt,
      });
      return { outcome: SyncRunOutcome.RATE_LIMITED, error, retryAt: error.retryAt };
    }

    this.syncState.recordSyncOutcome(sourceId, {
      ok: false,
      error: error.message,
      countsAsFailure: true,
    });
    // rejected credentials stop every source of the integration until a reconnect
    if (error instanceof IntegrationAuthError) {
      this.integrations.markNeedsReauth(target.integrationId);
    }
    return { outcome: SyncRunOutcome.FAILED, error };
  }

  // One line per run. Counts, ids and error class names only: never titles, descriptions,
  // credentials or headers, and no error messages, which can quote a provider's response.
  private logRun(result: SyncRunResult): void {
    const fields = [
      `source=${result.sourceId}`,
      `mode=${result.mode ?? 'none'}`,
      `pages=${result.pages}`,
      `inserted=${result.inserted}`,
      `updated=${result.updated}`,
      `removed=${result.removed}`,
      `skipped=${result.skipped}`,
      `durationMs=${result.durationMs}`,
      `outcome=${result.outcome}`,
      ...(result.skipReason ? [`reason=${result.skipReason}`] : []),
      ...(result.error ? [`error=${result.error.name}`] : []),
      ...(result.retryAt ? [`retryAt=${result.retryAt.toISOString()}`] : []),
    ];
    const line = `Sync run ${fields.join(' ')}`;
    if (
      result.outcome === SyncRunOutcome.FAILED ||
      result.outcome === SyncRunOutcome.RATE_LIMITED
    ) {
      this.logger.warn(line);
    } else {
      this.logger.info(line);
    }
  }
}

// the counts a run builds up page by page
class RunTally {
  mode: SyncMode | null = null;
  pages = 0;
  private inserted = 0;
  private updated = 0;
  private removed = 0;
  private skipped = 0;
  private readonly changed = new Set<SyncEntityType>();

  constructor(private readonly sourceId: ExternalSourceId) {}

  get itemsApplied(): number {
    return this.inserted + this.updated + this.removed;
  }

  addPage(summary: SyncSummary, skipped: number): void {
    this.pages += 1;
    this.inserted += summary.inserted;
    this.updated += summary.updated;
    this.removed += summary.removed;
    this.skipped += skipped;
    summary.changed.forEach((type) => this.changed.add(type));
  }

  result(): Omit<SyncRunResult, 'outcome' | 'durationMs'> {
    return {
      sourceId: this.sourceId,
      mode: this.mode,
      pages: this.pages,
      inserted: this.inserted,
      updated: this.updated,
      removed: this.removed,
      skipped: this.skipped,
      changed: [...this.changed],
    };
  }
}
