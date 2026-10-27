import { ExternalSourceId, IntegrationId } from '@common/ids';
import { consoleLogger } from '../shared/logger';
import { BaseIntegrationService, IntegrationChange } from '../integrations/service';
import { IntegrationStatus, Provider, SourceType } from '../integrations/types';
import {
  BACKOFF_INITIAL_MS,
  BACKOFF_MAX_MS,
  INCREMENTAL_INTERVAL_MS,
  MIN_TRIGGER_GAP_MS,
  RECONCILE_INTERVAL_MS,
} from './constants';
import type { BaseSyncEngine } from './engine';
import { SyncStateManager, SyncTarget } from './sync-state';
import { SyncLogger, SyncProgressListener, SyncRunOutcome } from './types';

// The clock and timers the scheduler runs on. Defaults to the global ones, resolved at each call,
// so Vitest's fake timers drive it.
export interface SchedulerTimers {
  now(): number;
  setImmediate(callback: () => void): NodeJS.Immediate;
  clearImmediate(handle: NodeJS.Immediate): void;
  setInterval(callback: () => void, ms: number): NodeJS.Timeout;
  clearInterval(handle: NodeJS.Timeout): void;
}

export interface SyncSchedulerOptions {
  engine: BaseSyncEngine;
  // which sources exist (list), and the changes that start and stop runs (onChange)
  integrations: BaseIntegrationService;
  // each source's failure count and retry time, for backoff
  syncState: Pick<SyncStateManager, 'getSyncTarget'>;
  timers?: SchedulerTimers;
  logger?: SyncLogger;
}

/**
 * Why a sync was asked for, from outside the scheduler. Focus and resume are skipped when the
 * source's last run finished under MIN_TRIGGER_GAP_MS ago, and while it backs off or waits on a
 * rate limit. Manual always runs, includes the reconcile pass, and restarts the backoff. Connected
 * always runs: a source that was just connected or switched on syncs at once, with the reconcile
 * pass when it resumes from a finished first sync. Reconnected runs as connected does, restarts
 * the backoff, and waits for the provider's retry time if one is ahead.
 */
export type SyncTrigger = 'focus' | 'resume' | 'manual' | 'connected' | 'reconnected';

// one source's sync state, for a status indicator and the settings page
export interface SourceSyncStatus {
  sourceId: ExternalSourceId;
  integrationId: IntegrationId;
  provider: Provider;
  sourceType: SourceType;
  // the integration's status; a source syncs only while it is connected
  status: IntegrationStatus;
  enabled: boolean;
  // a run is in flight
  running: boolean;
  lastSyncedAt: Date | null;
  lastError: string | null;
  retryAt: Date | null;
}

const globalTimers: SchedulerTimers = {
  now: () => Date.now(),
  setImmediate: (callback) => setImmediate(callback),
  clearImmediate: (handle) => clearImmediate(handle),
  setInterval: (callback, ms) => setInterval(callback, ms),
  clearInterval: (handle) => clearInterval(handle),
};

// the wait after `failures` failed runs in a row: 1 minute, doubling to a 30-minute cap
export function backoffDelay(failures: number): number {
  if (failures <= 0) return 0;
  return Math.min(BACKOFF_INITIAL_MS * 2 ** (failures - 1), BACKOFF_MAX_MS);
}

// Whether the source has finished its first sync. One that has resumes from its cursor when it
// starts syncing again, and needs the reconcile pass to catch what that incremental run can't see.
// One that hasn't gets a full pass, which needs no reconcile.
function hasFinishedFirstSync(target: SyncTarget | null): boolean {
  return target?.initialSyncCompletedAt != null;
}

// one source's run and the follow-up asked for while it was going
interface SourceRun {
  controller: AbortController;
  // at most one follow-up, whatever the number of triggers; it reconciles if any of them asked to
  followUp: { reconcile: boolean } | null;
  // settles once the run and its follow-up have ended; never rejects
  settled: Promise<void>;
}

/**
 * Decides when each source syncs: once when started, on an interval, on focus and resume, on
 * demand, when a source is connected or switched on, and when its integration is reconnected.
 * Runs go through SyncEngine; this class never touches the database except to read a source's
 * sync state.
 *
 * - One run per source at a time. A trigger during a run asks for a follow-up run, and any
 *   number of them cause exactly one.
 * - Sources run independently: one source's failure or backoff never delays another.
 * - Failures back off: interval, focus and resume runs are skipped until BACKOFF_INITIAL_MS,
 *   doubling with each failure in a row to BACKOFF_MAX_MS, has passed since the last run finished.
 * - After a rate-limited run nothing but a manual sync starts before the provider's retry time.
 * - A reconnect (status_changed to connected from anything but disabled) runs the integration's
 *   enabled sources at once, as connecting does, and restarts their backoff as a manual sync does:
 *   the failures were most likely the rejected credentials the reconnect replaced. A source whose
 *   provider retry time is ahead still waits for it. Enabling a disabled integration is not a
 *   reconnect: it sends source_changed for each source it switches on, which starts that source.
 * - A source switched back on, or whose integration is enabled or reconnected, also runs the
 *   reconcile pass if it has finished a first sync. Its incremental run resumes from the cursor,
 *   which cannot show issues reassigned, trashed or deleted while it was not syncing. A source's
 *   first sync is a full pass, so a reconcile straight after it would only repeat it.
 * - Disabling a source or its integration, or the integration moving to needs_reauth, aborts its
 *   runs, and so does disconnecting it; its sources never run again. stop() aborts everything and
 *   resolves once every run has settled.
 */
export class SyncScheduler {
  private readonly engine: BaseSyncEngine;
  private readonly integrations: BaseIntegrationService;
  private readonly syncState: Pick<SyncStateManager, 'getSyncTarget'>;
  private readonly timers: SchedulerTimers;
  private readonly logger: SyncLogger;
  // each source's run now, if any; one that was aborted stays here until it settles
  private readonly currentRuns = new Map<ExternalSourceId, SourceRun>();
  // every run that has not settled, aborted ones still finishing included; stop() waits on these
  private readonly unsettledRuns = new Set<Promise<void>>();
  // when each source's last run ended in this session; drives the focus gap and backoff
  private readonly lastRunFinishedAt = new Map<ExternalSourceId, number>();
  // a source's failure count when a manual sync or a reconnect restarted its backoff; failures
  // before it are ignored
  private readonly failureCountAtBackoffRestart = new Map<ExternalSourceId, number>();
  // the pass at start, until it begins
  private pendingOpenPass: NodeJS.Immediate | null = null;
  private tickInterval: NodeJS.Timeout | null = null;
  // when the last reconcile tick, or the pass at start, ran
  private lastReconcileTickAt = 0;
  private unsubscribeFromChanges: (() => void) | null = null;
  // sources of integrations being disconnected: aborted, and never run again
  private readonly removedSources = new Set<ExternalSourceId>();
  private isStarted = false;

  constructor(options: SyncSchedulerOptions) {
    this.engine = options.engine;
    this.integrations = options.integrations;
    this.syncState = options.syncState;
    this.timers = options.timers ?? globalTimers;
    this.logger = options.logger ?? consoleLogger;
  }

  /**
   * Syncs every enabled source once, with the reconcile pass, then every INCREMENTAL_INTERVAL_MS,
   * reconciling every RECONCILE_INTERVAL_MS. Calling it again while started does nothing.
   *
   * start() itself only subscribes and arms timers; the first pass (the "open pass") begins on the
   * next turn of the event loop, through setImmediate. Correctness does not depend on this: stop()
   * aborts and waits for every run, so nothing writes after it whenever it lands. The deferral is
   * for the caller, typically WorkspaceService.open and then whatever opened the workspace:
   *
   * - The caller finishes its own promise-chained work first. A listener it adds after further
   *   awaits that need no I/O (e.g. after reading the integration list) still sees every event of
   *   the open pass. Without the deferral, a run that fails without waiting on the network (e.g.
   *   credentials that fail to decrypt) reports its failure a few promise steps after start(),
   *   and such a listener misses it. An await that waits on I/O lets the pass run first either
   *   way, so listeners should be added before any such await.
   * - A stop() straight after start() cancels the pass before it does anything: no listing, no
   *   decrypting, no request started and then aborted.
   */
  start(): void {
    if (this.isStarted) return;
    this.isStarted = true;
    this.unsubscribeFromChanges = this.integrations.onChange((change) =>
      this.handleIntegrationChange(change),
    );
    // deferred to the next turn of the event loop; see above
    this.pendingOpenPass = this.timers.setImmediate(() => {
      this.pendingOpenPass = null;
      void this.forEachSyncableSource((sourceId) => void this.requestRun(sourceId, true));
    });
    // One timer for both: the tick that reaches the reconcile interval adds the reconcile pass to
    // its incremental run, so a shared mark never runs the incremental sync twice.
    this.lastReconcileTickAt = this.timers.now();
    this.tickInterval = this.timers.setInterval(() => {
      const now = this.timers.now();
      const reconcile = now - this.lastReconcileTickAt >= RECONCILE_INTERVAL_MS;
      if (reconcile) this.lastReconcileTickAt = now;
      void this.runIntervalTick(reconcile);
    }, INCREMENTAL_INTERVAL_MS);
  }

  /**
   * Clears the timers, stops listening for changes and aborts every run, then resolves once all
   * of them have settled, so nothing writes to the database after it does. The abort cancels a
   * provider request in flight, so a run waiting on one settles at once. The exception is an OAuth
   * token refresh, which is shared between callers and runs to its own timeout.
   */
  async stop(): Promise<void> {
    this.isStarted = false;
    this.unsubscribeFromChanges?.();
    this.unsubscribeFromChanges = null;
    if (this.pendingOpenPass !== null) this.timers.clearImmediate(this.pendingOpenPass);
    this.pendingOpenPass = null;
    if (this.tickInterval !== null) this.timers.clearInterval(this.tickInterval);
    this.tickInterval = null;
    for (const run of this.currentRuns.values()) run.controller.abort();
    // Every run must settle before stop() resolves, since close() then closes SQLite. allSettled,
    // not all: a run that rejected must not end the wait while the others are still going.
    await Promise.allSettled([...this.unsettledRuns]);
  }

  /**
   * Asks for a sync of one source, or of every enabled source when `sourceId` is left out.
   * Resolves once the runs it started or joined have settled; a skipped trigger resolves at once.
   * Does nothing until the scheduler is started.
   */
  async trigger(reason: SyncTrigger, sourceId?: ExternalSourceId): Promise<void> {
    if (!this.isStarted) return;
    const ids = sourceId ? [sourceId] : await this.syncableSourceIds();
    await Promise.all(ids.map((id) => this.applyTrigger(reason, id)));
  }

  /** "Sync now": a manual trigger, which always runs and includes the reconcile pass */
  syncNow(sourceId?: ExternalSourceId): Promise<void> {
    return this.trigger('manual', sourceId);
  }

  /** every source of every integration, with whether a run is in flight */
  async getStatus(): Promise<SourceSyncStatus[]> {
    const integrations = await this.integrations.list();
    return integrations.flatMap((integration) =>
      integration.sources.map((source) => ({
        sourceId: source.id,
        integrationId: integration.id,
        provider: integration.provider,
        sourceType: source.sourceType,
        status: integration.status,
        enabled: source.enabled,
        running: this.currentRuns.has(source.id),
        lastSyncedAt: source.lastSyncedAt,
        lastError: source.lastError,
        retryAt: source.retryAt,
      })),
    );
  }

  // returns a function that unsubscribes the listener
  onProgress(listener: SyncProgressListener): () => void {
    return this.engine.onProgress(listener);
  }

  private applyTrigger(reason: SyncTrigger, sourceId: ExternalSourceId): Promise<void> {
    switch (reason) {
      case 'manual': {
        const target = this.readSyncTarget(sourceId);
        if (target) this.restartBackoff(sourceId, target);
        return this.requestRun(sourceId, true);
      }
      case 'connected':
        return this.requestRun(sourceId, hasFinishedFirstSync(this.readSyncTarget(sourceId)));
      case 'reconnected': {
        const target = this.readSyncTarget(sourceId);
        if (target) this.restartBackoff(sourceId, target);
        // rate limited: the interval tick after the retry time runs it, with the backoff restarted
        if (target?.retryAt && target.retryAt.getTime() > this.timers.now()) {
          return Promise.resolve();
        }
        return this.requestRun(sourceId, hasFinishedFirstSync(target));
      }
      case 'focus':
      case 'resume': {
        const last = this.lastRunFinishedAt.get(sourceId);
        if (last !== undefined && this.timers.now() - last < MIN_TRIGGER_GAP_MS) {
          return Promise.resolve();
        }
        if (!this.isDueForAutomaticRun(sourceId)) return Promise.resolve();
        return this.requestRun(sourceId, false);
      }
    }
  }

  // failures so far no longer count toward the wait; a later success clears the record
  private restartBackoff(sourceId: ExternalSourceId, target: SyncTarget): void {
    this.failureCountAtBackoffRestart.set(sourceId, target.consecutiveFailures);
  }

  // an interval tick: every enabled source that is not backing off runs
  private async runIntervalTick(reconcile: boolean): Promise<void> {
    await this.forEachSyncableSource((sourceId) => {
      const run = this.currentRuns.get(sourceId);
      // the run in flight is this tick's incremental sync; a reconcile still follows it
      if (run && !run.controller.signal.aborted && !reconcile) return;
      if (!this.isDueForAutomaticRun(sourceId)) return;
      void this.requestRun(sourceId, reconcile);
    });
  }

  /**
   * Starts a run of the source, or, when one is in flight, asks it for one follow-up. A run that
   * was aborted but has not settled yet is followed by a new run once it has, so a source switched
   * off and straight back on still syncs, and never has two runs at once.
   */
  private requestRun(sourceId: ExternalSourceId, reconcile: boolean): Promise<void> {
    if (!this.isStarted || this.removedSources.has(sourceId)) return Promise.resolve();
    const current = this.currentRuns.get(sourceId);
    if (current && !current.controller.signal.aborted) {
      current.followUp = { reconcile: reconcile || (current.followUp?.reconcile ?? false) };
      return current.settled;
    }

    const controller = new AbortController();
    const run: SourceRun = { controller, followUp: null, settled: Promise.resolve() };
    const previous = current?.settled;
    const settled = (async () => {
      // also moves the run's start out of the caller, which may be an IntegrationService emit
      await previous;
      let next: { reconcile: boolean } | null = { reconcile };
      while (next && !controller.signal.aborted) {
        run.followUp = null;
        await this.syncOnce(sourceId, next.reconcile, controller.signal);
        next = run.followUp;
      }
    })().finally(() => {
      if (this.currentRuns.get(sourceId) === run) this.currentRuns.delete(sourceId);
      this.unsettledRuns.delete(settled);
    });
    run.settled = settled;
    this.currentRuns.set(sourceId, run);
    this.unsettledRuns.add(settled);
    return settled;
  }

  // one incremental run, followed by the reconcile pass when asked for and the run completed
  private async syncOnce(
    sourceId: ExternalSourceId,
    reconcile: boolean,
    signal: AbortSignal,
  ): Promise<void> {
    try {
      const result = await this.engine.runSource(sourceId, { signal });
      if (reconcile && result.outcome === SyncRunOutcome.COMPLETED && !signal.aborted) {
        await this.engine.reconcileSource(sourceId, { signal });
      }
    } catch (error) {
      // the engine reports failed runs in its result; this is a source deleted mid-run or a bug
      const name = error instanceof Error ? error.name : typeof error;
      this.logger.error(`Sync run threw source=${sourceId} error=${name}`);
    } finally {
      // an aborted run did nothing worth waiting on: a run straight after it may go
      if (!signal.aborted) this.lastRunFinishedAt.set(sourceId, this.timers.now());
    }
  }

  /**
   * Whether an interval, focus or resume run may start: the source is enabled, its integration is
   * connected, the provider's retry time has passed, and the backoff from failures in a row since
   * the last manual sync or reconnect has run out.
   */
  private isDueForAutomaticRun(sourceId: ExternalSourceId): boolean {
    const target = this.readSyncTarget(sourceId);
    if (!target || !target.enabled || target.status !== IntegrationStatus.CONNECTED) return false;
    const now = this.timers.now();
    if (target.retryAt && target.retryAt.getTime() > now) return false;

    let failuresBeforeRestart = this.failureCountAtBackoffRestart.get(sourceId) ?? 0;
    // a success since the restart reset the count, so the record no longer applies
    if (target.consecutiveFailures < failuresBeforeRestart) {
      this.failureCountAtBackoffRestart.delete(sourceId);
      failuresBeforeRestart = 0;
    }
    const lastFinishedAt = this.lastRunFinishedAt.get(sourceId);
    // nothing has run in this session, so nothing to wait from; the workspace-open pass runs
    if (lastFinishedAt === undefined) return true;
    const failures = target.consecutiveFailures - failuresBeforeRestart;
    return now >= lastFinishedAt + backoffDelay(failures);
  }

  private handleIntegrationChange(change: IntegrationChange): void {
    switch (change.type) {
      case 'connected':
        for (const source of change.sources) {
          if (source.enabled) void this.applyTrigger('connected', source.sourceId);
        }
        return;
      case 'source_changed':
        if (change.enabled) void this.applyTrigger('connected', change.sourceId);
        else this.abortRun(change.sourceId);
        return;
      case 'status_changed':
        if (change.status === IntegrationStatus.CONNECTED) {
          // from disabled is enabling, which sends source_changed for each source it switches on;
          // anything else is a reconnect, which sends nothing more
          if (change.previous !== IntegrationStatus.DISABLED) {
            void this.forEachSyncableSource(
              (sourceId) => void this.applyTrigger('reconnected', sourceId),
              change.integrationId,
            );
          }
          return;
        }
        // disabled or needs_reauth: its sources stop
        for (const sourceId of this.currentRuns.keys()) {
          const target = this.readSyncTarget(sourceId);
          if (!target || target.integrationId === change.integrationId) this.abortRun(sourceId);
        }
        return;
      case 'disconnected':
        // the integration is gone: abort its runs, which also cancels their requests, and never
        // schedule its sources again
        for (const sourceId of change.sourceIds) {
          this.removedSources.add(sourceId);
          this.abortRun(sourceId);
        }
        return;
    }
  }

  private abortRun(sourceId: ExternalSourceId): void {
    this.currentRuns.get(sourceId)?.controller.abort();
  }

  // the source's stored sync state, or null when it was deleted
  private readSyncTarget(sourceId: ExternalSourceId): SyncTarget | null {
    try {
      return this.syncState.getSyncTarget(sourceId);
    } catch {
      return null;
    }
  }

  // sources that are switched on, of integrations that are connected; of one integration if given
  private async syncableSourceIds(integrationId?: IntegrationId): Promise<ExternalSourceId[]> {
    const integrations = await this.integrations.list();
    return integrations
      .filter((integration) => integration.status === IntegrationStatus.CONNECTED)
      .filter((integration) => integrationId === undefined || integration.id === integrationId)
      .flatMap((integration) => integration.sources.filter((source) => source.enabled))
      .map((source) => source.id);
  }

  // For the pass at start, the interval ticks and reconnects, which nothing awaits: never rejects,
  // so a failure to list the sources is logged and that pass is skipped. The next tick tries again.
  private async forEachSyncableSource(
    callback: (sourceId: ExternalSourceId) => void,
    integrationId?: IntegrationId,
  ): Promise<void> {
    try {
      const ids = await this.syncableSourceIds(integrationId);
      // stopped while listing
      if (!this.isStarted) return;
      ids.forEach(callback);
    } catch (error) {
      // the error class only, as for a run: a message could quote stored data
      const name = error instanceof Error ? error.name : typeof error;
      this.logger.error(`Listing sources to sync threw error=${name}`);
    }
  }
}
