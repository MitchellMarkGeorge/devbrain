import { ExternalSourceId, IntegrationId } from '@common/ids';
import log from 'electron-log';
import { IntegrationChange, IntegrationService, SyncTarget } from '../integrations/service';
import { IntegrationStatus, Provider, SourceType } from '../integrations/types';
import {
  BACKOFF_INITIAL_MS,
  BACKOFF_MAX_MS,
  INCREMENTAL_INTERVAL_MS,
  MIN_TRIGGER_GAP_MS,
  RECONCILE_INTERVAL_MS,
} from './constants';
import type { RunOptions, SyncLogger } from './engine';
import { SyncProgressListener, SyncRunOutcome, SyncRunResult } from './types';

// What the scheduler needs from SyncEngine. reconcileSource is optional until the reconcile pass
// (feature 11) lands; without it a reconcile run is an incremental run only.
export interface SchedulerEngine {
  runSource(sourceId: ExternalSourceId, options?: RunOptions): Promise<SyncRunResult>;
  reconcileSource?(sourceId: ExternalSourceId, options?: RunOptions): Promise<SyncRunResult>;
  onProgress(listener: SyncProgressListener): () => void;
}

// What the scheduler reads from IntegrationService: which sources exist, their stored sync state,
// and the changes that start and stop runs.
export type SchedulerIntegrations = Pick<IntegrationService, 'list' | 'getSyncTarget' | 'onChange'>;

// The clock and timers the scheduler runs on. Defaults to the global ones, resolved at each call,
// so Vitest's fake timers drive it.
export interface SchedulerTimers {
  now(): number;
  setTimeout(callback: () => void, ms: number): unknown;
  clearTimeout(handle: unknown): void;
  setInterval(callback: () => void, ms: number): unknown;
  clearInterval(handle: unknown): void;
}

export interface SyncSchedulerOptions {
  engine: SchedulerEngine;
  integrations: SchedulerIntegrations;
  timers?: SchedulerTimers;
  logger?: SyncLogger;
}

/**
 * Why a sync was asked for, from outside the scheduler. Focus and resume are skipped when the
 * source's last run finished under MIN_TRIGGER_GAP_MS ago, and while it backs off or waits on a
 * rate limit. Manual always runs, includes the reconcile pass, and restarts the backoff. Connected
 * always runs: a source that was just connected or switched on gets its first sync at once.
 */
export type SyncTrigger = 'focus' | 'resume' | 'manual' | 'connected';

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
  setTimeout: (callback, ms) => setTimeout(callback, ms),
  clearTimeout: (handle) => clearTimeout(handle as NodeJS.Timeout),
  setInterval: (callback, ms) => setInterval(callback, ms),
  clearInterval: (handle) => clearInterval(handle as NodeJS.Timeout),
};

// the wait after `failures` failed runs in a row: 1 minute, doubling to a 30-minute cap
export function backoffDelay(failures: number): number {
  if (failures <= 0) return 0;
  return Math.min(BACKOFF_INITIAL_MS * 2 ** (failures - 1), BACKOFF_MAX_MS);
}

// one source's run and the follow-up asked for while it was going
interface SourceRun {
  controller: AbortController;
  // at most one follow-up, whatever the number of triggers; it reconciles if any of them asked to
  again: { reconcile: boolean } | null;
  // settles once the run and its follow-up have ended; never rejects
  done: Promise<void>;
}

/**
 * Decides when each source syncs: once when started, on an interval, on focus and resume, on
 * demand, and when a source is connected or switched on. Runs go through SyncEngine; this class
 * never touches the database except to read a source's sync state.
 *
 * - One run per source at a time. A trigger during a run sets a single "run again" flag, so any
 *   number of them cause exactly one follow-up.
 * - Sources run independently: one source's failure or backoff never delays another.
 * - Failures back off: interval, focus and resume runs are skipped until BACKOFF_INITIAL_MS,
 *   doubling with each failure in a row to BACKOFF_MAX_MS, has passed since the last run finished.
 * - After a rate-limited run nothing but a manual sync starts before the provider's retry time.
 * - Disabling a source or its integration, or the integration moving to needs_reauth, aborts its
 *   runs. stop() aborts everything and resolves once every run has settled.
 */
export class SyncScheduler {
  private readonly engine: SchedulerEngine;
  private readonly integrations: SchedulerIntegrations;
  private readonly timers: SchedulerTimers;
  private readonly logger: SyncLogger;
  private readonly runs = new Map<ExternalSourceId, SourceRun>();
  // every run that has not settled, aborted ones still finishing included; stop() waits on these
  private readonly settling = new Set<Promise<void>>();
  // when each source's last run ended in this session; drives the focus gap and backoff
  private readonly lastFinishedAt = new Map<ExternalSourceId, number>();
  // a source's failure count when a manual sync restarted its backoff; failures before it are ignored
  private readonly backoffFloor = new Map<ExternalSourceId, number>();
  private readonly timeouts = new Set<unknown>();
  private interval: unknown = null;
  // when the last reconcile tick, or the pass at start, ran
  private lastReconcileTickAt = 0;
  private unsubscribe: (() => void) | null = null;
  private started = false;

  constructor(options: SyncSchedulerOptions) {
    this.engine = options.engine;
    this.integrations = options.integrations;
    this.timers = options.timers ?? globalTimers;
    this.logger = options.logger ?? log.scope('sync');
  }

  /**
   * Syncs every enabled source once, with the reconcile pass, then every INCREMENTAL_INTERVAL_MS,
   * reconciling every RECONCILE_INTERVAL_MS. The first pass starts on the next tick, so start()
   * returns at once and a stop() straight after it sends nothing. Calling it again while started
   * does nothing.
   */
  start(): void {
    if (this.started) return;
    this.started = true;
    this.unsubscribe = this.integrations.onChange((change) => this.onChange(change));
    this.after(0, () => void this.forEachEnabled((sourceId) => void this.request(sourceId, true)));
    // One timer for both: the tick that reaches the reconcile interval adds the reconcile pass to
    // its incremental run, so a shared mark never runs the incremental sync twice.
    this.lastReconcileTickAt = this.timers.now();
    this.interval = this.timers.setInterval(() => {
      const now = this.timers.now();
      const reconcile = now - this.lastReconcileTickAt >= RECONCILE_INTERVAL_MS;
      if (reconcile) this.lastReconcileTickAt = now;
      void this.tick(reconcile);
    }, INCREMENTAL_INTERVAL_MS);
  }

  /**
   * Clears the timers, stops listening for changes and aborts every run, then resolves once all
   * of them have settled, so nothing writes to the database after it does. A run waiting on the
   * provider settles when that request does; its page is then discarded.
   */
  async stop(): Promise<void> {
    this.started = false;
    this.unsubscribe?.();
    this.unsubscribe = null;
    for (const handle of this.timeouts) this.timers.clearTimeout(handle);
    this.timeouts.clear();
    if (this.interval !== null) this.timers.clearInterval(this.interval);
    this.interval = null;
    for (const run of this.runs.values()) run.controller.abort();
    await Promise.all([...this.settling]);
  }

  /**
   * Asks for a sync of one source, or of every enabled source when `sourceId` is left out.
   * Resolves once the runs it started or joined have settled; a skipped trigger resolves at once.
   * Does nothing until the scheduler is started.
   */
  async trigger(reason: SyncTrigger, sourceId?: ExternalSourceId): Promise<void> {
    if (!this.started) return;
    const ids = sourceId ? [sourceId] : await this.enabledSourceIds();
    await Promise.all(ids.map((id) => this.triggerSource(reason, id)));
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
        running: this.runs.has(source.id),
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

  private triggerSource(reason: SyncTrigger, sourceId: ExternalSourceId): Promise<void> {
    switch (reason) {
      case 'manual': {
        // failures so far no longer count toward the wait; a success clears the floor again
        const target = this.target(sourceId);
        if (target) this.backoffFloor.set(sourceId, target.consecutiveFailures);
        return this.request(sourceId, true);
      }
      case 'connected':
        return this.request(sourceId, false);
      case 'focus':
      case 'resume': {
        const last = this.lastFinishedAt.get(sourceId);
        if (last !== undefined && this.timers.now() - last < MIN_TRIGGER_GAP_MS) {
          return Promise.resolve();
        }
        if (!this.isDue(sourceId)) return Promise.resolve();
        return this.request(sourceId, false);
      }
    }
  }

  // an interval tick: every enabled source that is not backing off runs
  private async tick(reconcile: boolean): Promise<void> {
    await this.forEachEnabled((sourceId) => {
      const run = this.runs.get(sourceId);
      // the run in flight is this tick's incremental sync; a reconcile still follows it
      if (run && !run.controller.signal.aborted && !reconcile) return;
      if (!this.isDue(sourceId)) return;
      void this.request(sourceId, reconcile);
    });
  }

  /**
   * Starts a run of the source, or, when one is in flight, asks it for one follow-up. A run that
   * was aborted but has not settled yet is followed by a new run once it has, so a source switched
   * off and straight back on still syncs, and never has two runs at once.
   */
  private request(sourceId: ExternalSourceId, reconcile: boolean): Promise<void> {
    if (!this.started) return Promise.resolve();
    const current = this.runs.get(sourceId);
    if (current && !current.controller.signal.aborted) {
      current.again = { reconcile: reconcile || (current.again?.reconcile ?? false) };
      return current.done;
    }

    const controller = new AbortController();
    const run: SourceRun = { controller, again: null, done: Promise.resolve() };
    const previous = current?.done;
    const done = (async () => {
      // also moves the run's start out of the caller, which may be an IntegrationService emit
      await previous;
      let next: { reconcile: boolean } | null = { reconcile };
      while (next && !controller.signal.aborted) {
        run.again = null;
        await this.execute(sourceId, next.reconcile, controller.signal);
        next = run.again;
      }
    })().finally(() => {
      if (this.runs.get(sourceId) === run) this.runs.delete(sourceId);
      this.settling.delete(done);
    });
    run.done = done;
    this.runs.set(sourceId, run);
    this.settling.add(done);
    return done;
  }

  // one incremental run, followed by the reconcile pass when asked for and the run completed
  private async execute(
    sourceId: ExternalSourceId,
    reconcile: boolean,
    signal: AbortSignal,
  ): Promise<void> {
    try {
      const result = await this.engine.runSource(sourceId, { signal });
      if (
        reconcile &&
        this.engine.reconcileSource &&
        result.outcome === SyncRunOutcome.COMPLETED &&
        !signal.aborted
      ) {
        await this.engine.reconcileSource(sourceId, { signal });
      }
    } catch (error) {
      // the engine reports failed runs in its result; this is a source deleted mid-run or a bug
      const name = error instanceof Error ? error.name : typeof error;
      this.logger.error(`Sync run threw source=${sourceId} error=${name}`);
    } finally {
      // an aborted run did nothing worth waiting on: a run straight after it may go
      if (!signal.aborted) this.lastFinishedAt.set(sourceId, this.timers.now());
    }
  }

  /**
   * Whether an interval, focus or resume run may start: the source is enabled, its integration is
   * connected, the provider's retry time has passed, and the backoff from failures in a row since
   * the last manual sync has run out.
   */
  private isDue(sourceId: ExternalSourceId): boolean {
    const target = this.target(sourceId);
    if (!target || !target.enabled || target.status !== IntegrationStatus.CONNECTED) return false;
    const now = this.timers.now();
    if (target.retryAt && target.retryAt.getTime() > now) return false;

    let floor = this.backoffFloor.get(sourceId) ?? 0;
    // a success since the manual sync reset the count, so the floor no longer applies
    if (target.consecutiveFailures < floor) {
      this.backoffFloor.delete(sourceId);
      floor = 0;
    }
    const last = this.lastFinishedAt.get(sourceId);
    // nothing has run in this session, so nothing to wait from; the workspace-open pass runs
    if (last === undefined) return true;
    return now >= last + backoffDelay(target.consecutiveFailures - floor);
  }

  private onChange(change: IntegrationChange): void {
    switch (change.type) {
      case 'connected':
        for (const source of change.sources) {
          if (source.enabled) void this.triggerSource('connected', source.sourceId);
        }
        return;
      case 'source_changed':
        if (change.enabled) void this.triggerSource('connected', change.sourceId);
        else this.abort(change.sourceId);
        return;
      case 'status_changed':
        // disabled or needs_reauth: its sources stop; enabling sends source_changed per source
        if (change.status !== IntegrationStatus.CONNECTED) {
          for (const sourceId of this.runs.keys()) {
            const target = this.target(sourceId);
            if (!target || target.integrationId === change.integrationId) this.abort(sourceId);
          }
        }
        return;
      case 'sync_status_changed':
        return;
    }
  }

  private abort(sourceId: ExternalSourceId): void {
    this.runs.get(sourceId)?.controller.abort();
  }

  // the source's stored sync state, or null when it was deleted
  private target(sourceId: ExternalSourceId): SyncTarget | null {
    try {
      return this.integrations.getSyncTarget(sourceId);
    } catch {
      return null;
    }
  }

  // sources that are switched on, of integrations that are connected
  private async enabledSourceIds(): Promise<ExternalSourceId[]> {
    const integrations = await this.integrations.list();
    return integrations
      .filter((integration) => integration.status === IntegrationStatus.CONNECTED)
      .flatMap((integration) => integration.sources.filter((source) => source.enabled))
      .map((source) => source.id);
  }

  private async forEachEnabled(callback: (sourceId: ExternalSourceId) => void): Promise<void> {
    const ids = await this.enabledSourceIds();
    // stopped while listing
    if (!this.started) return;
    ids.forEach(callback);
  }

  private after(ms: number, callback: () => void): void {
    const handle = this.timers.setTimeout(() => {
      this.timeouts.delete(handle);
      callback();
    }, ms);
    this.timeouts.add(handle);
  }
}
