import { ExternalSourceId } from '@common/ids';
import { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import log from 'electron-log';
import { z } from 'zod';
import { CredentialStore } from '../integrations/credential-store';
import { IntegrationService, SyncTarget } from '../integrations/service';
import { SyncCursor, SourceConfig, TaskSource } from '../integrations/providers/provider';
import { ProviderRegistry } from '../integrations/providers/registry';
import { linearTaskConfigSchema, linearTaskCursorSchema } from '../integrations/schema';
import { IntegrationStatus, Provider, SourceType } from '../integrations/types';
import { IntegrationAuthError, RateLimitError, SyncPageLimitError } from '../shared/errors';
import { MAX_PAGES_PER_RUN } from './constants';
import { SyncWriter } from './writer';
import {
  SyncEntityType,
  SyncMode,
  SyncProgress,
  SyncProgressListener,
  SyncRunOutcome,
  SyncRunResult,
  SyncSkipReason,
  SyncSummary,
} from './types';

// the electron-log methods the engine uses; injected in tests
export interface SyncLogger {
  info(...params: unknown[]): void;
  warn(...params: unknown[]): void;
  error(...params: unknown[]): void;
}

export interface SyncEngineOptions {
  integrations: IntegrationService;
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

// How each provider's task cursor and config are stored. The engine validates the stored JSON
// with these before handing it back to the provider; an unreadable cursor starts a fresh initial
// sync. A provider without an entry has no task sync.
const TASK_SOURCE_SCHEMAS: Partial<
  Record<Provider, { cursor: z.ZodType<SyncCursor>; config: z.ZodType<SourceConfig> }>
> = {
  [Provider.LINEAR]: { cursor: linearTaskCursorSchema, config: linearTaskConfigSchema },
};

/**
 * Runs one sync for one source: pull a page, apply it with SyncWriter and save the provider's next
 * cursor in the same transaction, until the provider says it is done. A crash or abort at any
 * point leaves the last committed page and its cursor, so the next run resumes from there.
 *
 * Deciding when to run (intervals, backoff, one run per source) is the scheduler's job. The engine
 * only refuses to start a run that cannot or must not talk to the provider, and records how each
 * run ended on its source through IntegrationService, which tells the scheduler and the renderer.
 */
export class SyncEngine {
  private readonly integrations: IntegrationService;
  private readonly credentials: CredentialStore;
  private readonly providers: ProviderRegistry;
  private readonly writer: SyncWriter;
  private readonly logger: SyncLogger;
  private readonly now: () => Date;
  private readonly maxPagesPerRun: number;
  private readonly listeners = new Set<SyncProgressListener>();
  // sources with a run in flight; a second run for one of them is skipped
  private readonly running = new Set<ExternalSourceId>();

  constructor(
    private readonly db: BetterSQLite3Database,
    options: SyncEngineOptions,
  ) {
    this.integrations = options.integrations;
    this.credentials = options.credentials;
    this.providers = options.providers;
    this.writer = options.writer;
    this.logger = options.logger ?? log.scope('sync');
    this.now = options.now ?? (() => new Date());
    this.maxPagesPerRun = options.maxPagesPerRun ?? MAX_PAGES_PER_RUN;
  }

  /**
   * Initial or incremental sync of one tasks source, by its stored cursor.
   *
   * 0. An already aborted signal ends the run before anything is read.
   * 1. Load the source and its integration; skip when either is off, the integration needs
   *    re-authentication, or the provider's retry time has not passed.
   * 2. Read the stored cursor; an unreadable one is treated as null, which starts an initial sync.
   * 3. Get auth, then per page: check the signal, pull, check the signal again (an aborted run
   *    discards the page it was waiting on), then apply the page and save its cursor in one
   *    transaction. The last page of an initial pass also sets initialSyncCompletedAt; the
   *    provider's cursor after it is already incremental. A run that reaches the page cap without
   *    the provider finishing fails, keeping the pages it committed.
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
      const target = this.integrations.getSyncTarget(sourceId);
      const blocked = this.skipReason(target);
      if (blocked) return skip(blocked);
      const tasks = this.providers.get(target.provider)?.tasks;
      const schemas = TASK_SOURCE_SCHEMAS[target.provider];
      if (target.sourceType !== SourceType.TASKS || !tasks || !schemas) {
        return skip(SyncSkipReason.UNSUPPORTED);
      }

      // 2. a cursor that does not parse, e.g. written by an older version, starts over
      const stored = schemas.cursor.safeParse(target.cursor);
      const cursor = stored.success ? stored.data : null;
      run.mode =
        cursor === null || target.initialSyncCompletedAt === null
          ? SyncMode.INITIAL
          : SyncMode.INCREMENTAL;

      try {
        const config = schemas.config.parse(target.config);
        await this.pullPages(sourceId, target, tasks, cursor, config, run, options.signal);
      } catch (error) {
        // whatever failed after an abort was cut short by it; report the abort, record nothing
        if (options.signal?.aborted) return finish({ outcome: SyncRunOutcome.ABORTED });
        return finish(this.recordFailure(sourceId, target, error));
      }

      if (options.signal?.aborted) return finish({ outcome: SyncRunOutcome.ABORTED });
      // 4. success
      this.integrations.recordSyncOutcome(sourceId, { ok: true, at: this.now() });
      return finish({ outcome: SyncRunOutcome.COMPLETED });
    } finally {
      this.running.delete(sourceId);
    }
  }

  // returns a function that unsubscribes the listener
  onProgress(listener: SyncProgressListener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  // 3. the page loop; returns early, with everything so far committed, when the signal aborts
  private async pullPages(
    sourceId: ExternalSourceId,
    target: SyncTarget,
    tasks: TaskSource,
    cursor: SyncCursor | null,
    config: SourceConfig,
    run: RunTally,
    signal: AbortSignal | undefined,
  ): Promise<void> {
    const auth = await this.credentials.getAuth(target.integrationId);

    let current = cursor;
    let done = false;
    do {
      // the pages so far are committed, so the next run resumes after them
      if (run.pages >= this.maxPagesPerRun) throw new SyncPageLimitError(this.maxPagesPerRun);
      if (signal?.aborted) return;
      const page = await tasks.pull(auth, current, config);
      // the page arrived after an abort: discard it, so nothing is written after the abort
      if (signal?.aborted) return;

      const completesInitial = run.mode === SyncMode.INITIAL && page.done;
      // the writer's own transaction becomes a savepoint inside this one, so the page and its
      // cursor commit together or not at all
      const summary = this.db.transaction(() => {
        const summary = this.writer.applyTaskPage(sourceId, page);
        this.integrations.saveCursor(sourceId, page.nextCursor, {
          ...(completesInitial && { initialSyncCompletedAt: this.now() }),
        });
        return summary;
      });
      run.addPage(summary, page.skipped);
      this.emitProgress({
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

  private skipReason(target: SyncTarget): SyncSkipReason | null {
    if (target.status === IntegrationStatus.NEEDS_REAUTH) return SyncSkipReason.NEEDS_REAUTH;
    if (target.status === IntegrationStatus.DISABLED) return SyncSkipReason.INTEGRATION_DISABLED;
    if (!target.enabled) return SyncSkipReason.SOURCE_DISABLED;
    if (target.retryAt && target.retryAt.getTime() > this.now().getTime())
      return SyncSkipReason.RATE_LIMITED;
    return null;
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
      this.integrations.recordSyncOutcome(sourceId, {
        ok: false,
        error: error.message,
        countsAsFailure: false,
        retryAt: error.retryAt,
      });
      return { outcome: SyncRunOutcome.RATE_LIMITED, error, retryAt: error.retryAt };
    }

    this.integrations.recordSyncOutcome(sourceId, {
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

  private emitProgress(progress: SyncProgress): void {
    // the page is already committed, so a failing listener must not fail the run or the others
    for (const listener of [...this.listeners]) {
      try {
        listener(progress);
      } catch (error) {
        // the error class only, like the run's own line: a message could quote item data
        const name = error instanceof Error ? error.name : typeof error;
        this.logger.error(`Sync progress listener threw source=${progress.sourceId} error=${name}`);
      }
    }
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
