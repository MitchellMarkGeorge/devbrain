import { ExternalSourceId } from '@common/ids';
import { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import log from 'electron-log';
import { z } from 'zod';
import { CredentialStore } from '../integrations/credential-store';
import { IntegrationService } from '../integrations/service';
import { SyncStateManager, SyncTarget } from './sync-state';
import {
  LookupResult,
  Provider as ProviderImpl,
  SyncCursor,
  SourceConfig,
  TaskSource,
} from '../integrations/providers/provider';
import { ProviderRegistry } from '../integrations/providers/registry';
import {
  googleEventCursorSchema,
  linearTaskConfigSchema,
  linearTaskCursorSchema,
} from '../integrations/schema';
import { IntegrationStatus, Provider, SourceType } from '../integrations/types';
import { IntegrationAuthError, RateLimitError, SyncPageLimitError } from '../shared/errors';
import { CLOSED_ISSUE_WINDOW_MS, MAX_PAGES_PER_RUN } from './constants';
import { SyncWriter } from './writer';
import { Syncer } from './syncer';
import { TaskSyncer } from './task-syncer';
import { EventSyncer } from './event-syncer';
import {
  ReattachRefusal,
  ReattachResult,
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

// How each provider's task cursor and config are stored. The engine validates the stored JSON
// with these before handing it back to the provider; an unreadable cursor starts a fresh initial
// sync. A provider without an entry has no task sync.
const TASK_SOURCE_SCHEMAS: Partial<
  Record<Provider, { cursor: z.ZodType<SyncCursor>; config: z.ZodType<SourceConfig> }>
> = {
  [Provider.LINEAR]: { cursor: linearTaskCursorSchema, config: linearTaskConfigSchema },
};

// How each provider's events cursor is stored, validated the same way. An events source has no
// stored config: what it syncs is the calendars selected in the calendars table (see EventSyncer).
const EVENT_CURSOR_SCHEMAS: Partial<Record<Provider, z.ZodType<SyncCursor>>> = {
  [Provider.GOOGLE_CALENDAR]: googleEventCursorSchema,
};

/**
 * Runs one sync for one source: start the syncer for its type, then pull a page, apply it and save
 * the provider's next cursor in the same transaction, until the provider says it is done. A crash
 * or abort at any point leaves the last committed page and its cursor, so the next run resumes
 * from there. What differs by source type (what a page holds, how it is written, what a run does
 * first) is in the type's Syncer; the engine knows no source type beyond picking it.
 *
 * Deciding when to run (intervals, backoff, one run per source) is the scheduler's job. The engine
 * only refuses to start a run that cannot or must not talk to the provider, and records how each
 * run ended on its source through SyncStateManager, which tells the scheduler and the renderer.
 */
export class SyncEngine {
  private readonly integrations: IntegrationService;
  private readonly syncState: SyncStateManager;
  private readonly credentials: CredentialStore;
  private readonly providers: ProviderRegistry;
  private readonly writer: SyncWriter;
  private readonly logger: SyncLogger;
  private readonly now: () => Date;
  private readonly maxPagesPerRun: number;
  private readonly listeners = new Set<SyncProgressListener>();
  // sources with a run in flight; a second run for one of them is skipped
  private readonly running = new Set<ExternalSourceId>();
  // the syncer for each source type and its provider; null when the provider has none
  private readonly syncers: Record<
    SourceType,
    (provider: ProviderImpl, target: SyncTarget) => Syncer | null
  >;

  constructor(
    private readonly db: BetterSQLite3Database,
    options: SyncEngineOptions,
  ) {
    this.integrations = options.integrations;
    this.syncState = options.syncState;
    this.credentials = options.credentials;
    this.providers = options.providers;
    this.writer = options.writer;
    this.logger = options.logger ?? log.scope('sync');
    this.now = options.now ?? (() => new Date());
    this.maxPagesPerRun = options.maxPagesPerRun ?? MAX_PAGES_PER_RUN;
    this.syncers = {
      [SourceType.TASKS]: (provider, target) => {
        const schemas = TASK_SOURCE_SCHEMAS[target.provider];
        return provider.tasks && schemas
          ? new TaskSyncer(this.writer, provider.tasks, schemas.cursor, schemas.config)
          : null;
      },
      [SourceType.EVENTS]: (provider, target) => {
        const cursorSchema = EVENT_CURSOR_SCHEMAS[target.provider];
        return provider.events && cursorSchema
          ? new EventSyncer(this.db, this.writer, provider.events, cursorSchema)
          : null;
      },
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
   *    and save its cursor in one transaction. A page the syncer declines to apply ends the run. The last page of an initial pass also sets initialSyncCompletedAt; the
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
      const target = this.syncState.getSyncTarget(sourceId);
      const blocked = this.skipReason(target);
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
   * The reconcile pass of one tasks source: finds what the incremental pull cannot see, namely
   * issues reassigned away, deleted or restored from the trash, and projects that left scope.
   *
   * 0-1. As runSource: an aborted signal, a run in flight, or a source or integration that is off,
   *    needs re-authentication or is rate limited ends it early. So does a source whose initial
   *    sync has not finished.
   * 2. Ask the provider for the ids of the open items assigned to the viewer now.
   * 3. Diff them against the watched links (SyncWriter.planReconcile). With no candidates and no
   *    returning issues nothing is looked up, so most passes make one request; otherwise one
   *    lookup covers them and the source's mirrored projects.
   * 4. Apply the lookup, settle closed issues past the window and run the project lifecycle, in
   *    one transaction (SyncWriter.applyReconcile), then report it as one page.
   * 5. Record the outcome as runSource does; success also sets lastReconciledAt.
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
      const blocked = this.skipReason(target);
      if (blocked) return skip(blocked);
      const tasks = this.providers.get(target.provider)?.tasks;
      if (target.sourceType !== SourceType.TASKS || !tasks) {
        return skip(SyncSkipReason.UNSUPPORTED);
      }
      // before the first full pass every snapshot id would look like a returning issue
      if (target.initialSyncCompletedAt === null) {
        return skip(SyncSkipReason.INITIAL_SYNC_PENDING);
      }

      try {
        await this.reconcile(sourceId, target, tasks, run, options.signal);
      } catch (error) {
        if (options.signal?.aborted) return finish({ outcome: SyncRunOutcome.ABORTED });
        return finish(this.recordFailure(sourceId, target, error));
      }

      if (options.signal?.aborted) return finish({ outcome: SyncRunOutcome.ABORTED });
      // 5. success
      const at = this.now();
      this.syncState.recordSyncOutcome(sourceId, { ok: true, at });
      this.syncState.markReconciled(sourceId, at);
      return finish({ outcome: SyncRunOutcome.COMPLETED });
    } finally {
      this.running.delete(sourceId);
    }
  }

  /**
   * Refreshes detached tasks from the provider and hands them back to sync: the reattach behind
   * DetachService. Not a run: no cursor moves, no outcome is recorded on the source, and a run in
   * flight is not waited for, as each write is its own transaction.
   *
   * 1. Refuse, as a run would be skipped, when the source or its integration is off, the
   *    integration needs re-authentication, the provider asked to wait, or it has no tasks.
   * 2. Look up the root and its detached descendants. The root must come back readable and
   *    assigned to the viewer; otherwise this refuses, having written nothing.
   * 3. Hand the descendants that came back assigned back to sync with the root, through
   *    SyncWriter.reattachTasks. Those gone, reassigned or unreadable stay detached.
   *
   * Rejected credentials also move the integration to needs_reauth, as in a run, and throw; so
   * does any other lookup failure.
   */
  async reattachTasks(
    sourceId: ExternalSourceId,
    rootExternalId: string,
    descendantExternalIds: string[],
  ): Promise<ReattachResult> {
    // 1.
    const target = this.syncState.getSyncTarget(sourceId);
    const blocked = this.skipReason(target);
    if (blocked) return { ok: false, reason: blocked };
    const tasks = this.providers.get(target.provider)?.tasks;
    if (target.sourceType !== SourceType.TASKS || !tasks) {
      return { ok: false, reason: SyncSkipReason.UNSUPPORTED };
    }

    // 2.
    const ids = [rootExternalId, ...descendantExternalIds];
    let found: LookupResult;
    try {
      const auth = await this.credentials.getAuth(target.integrationId);
      found = await tasks.lookup(auth, ids);
    } catch (error) {
      if (error instanceof IntegrationAuthError) {
        this.integrations.markNeedsReauth(target.integrationId);
      }
      throw error;
    }
    const root = found.tasks.find((task) => task.externalId === rootExternalId);
    if (found.gone.includes(rootExternalId)) return { ok: false, reason: ReattachRefusal.GONE };
    if (!root) return { ok: false, reason: ReattachRefusal.UNREADABLE };
    if (!root.assignedToViewer) return { ok: false, reason: ReattachRefusal.UNASSIGNED };

    // 3.
    const assigned = found.tasks.filter((task) => task.assignedToViewer);
    const leftDetached = ids.filter((id) => !assigned.some((task) => task.externalId === id));
    const summary = this.writer.reattachTasks(
      sourceId,
      rootExternalId,
      { tasks: assigned, projects: found.projects },
      leftDetached,
    );
    if (!summary) return { ok: false, reason: ReattachRefusal.CHANGED };
    this.logger.info(
      `Reattached ${summary.reattached.length} task(s) on ${sourceId}, ` +
        `${leftDetached.length} left detached`,
    );
    return { ok: true, summary };
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
    syncer: Syncer,
    cursor: SyncCursor | null,
    run: RunTally,
    signal: AbortSignal | undefined,
  ): Promise<void> {
    const auth = await this.credentials.getAuth(target.integrationId);
    if (signal?.aborted) return;
    // writes nothing: every write of the run is in sync.apply, below
    const sync = await syncer.start({ sourceId, target, auth, cursor });

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

  // 2-4. returns early, having written nothing, when the signal aborts before the write
  private async reconcile(
    sourceId: ExternalSourceId,
    target: SyncTarget,
    tasks: TaskSource,
    run: RunTally,
    signal: AbortSignal | undefined,
  ): Promise<void> {
    const auth = await this.credentials.getAuth(target.integrationId);
    if (signal?.aborted) return;
    // 2.
    const assigned = await tasks.listAssignedIds(auth);
    if (signal?.aborted) return;

    // 3.
    const plan = this.writer.planReconcile(sourceId, assigned);
    const ids = [...plan.candidates, ...plan.returning];
    let found: LookupResult = { tasks: [], projects: [], gone: [], goneProjects: [], skipped: 0 };
    if (ids.length > 0) {
      found = await tasks.lookup(auth, ids, { projectIds: plan.projectIds });
      if (signal?.aborted) return;
    }

    // 4.
    const settleBefore = new Date(this.now().getTime() - CLOSED_ISSUE_WINDOW_MS);
    const summary = this.writer.applyReconcile(sourceId, found, { settleBefore });
    run.addPage(summary, found.skipped);
    this.emitProgress({
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
    return provider ? this.syncers[target.sourceType](provider, target) : null;
  }

  // the stored cursor, validated with the syncer's schema; one that does not parse, e.g. written
  // by an older version, is null, which starts a fresh initial sync
  private parseCursor(syncer: Syncer, target: SyncTarget): SyncCursor | null {
    const stored = syncer.cursorSchema.safeParse(target.cursor);
    return stored.success ? stored.data : null;
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
