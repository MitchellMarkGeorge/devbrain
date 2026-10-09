import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { eq } from 'drizzle-orm';
import { ExternalSourceId, IntegrationId } from '@common/ids';
import { externalSources } from '@main/db/schema/integrations';
import { tasks as tasksTable } from '@main/db/schema/tasks';
import { createDb } from '../utils';
import { FakeCipher } from '../__mocks__/fake-cipher';
import { createFakeProvider, FAKE_API_KEY, FakeProvider } from './fake-provider';
import { SyncEngine, RunOptions } from '../../sync/engine';
import { SyncWriter } from '../../sync/writer';
import { backoffDelay, SchedulerEngine, SyncScheduler } from '../../sync/scheduler';
import { SyncProgressListener, SyncRunOutcome, SyncRunResult } from '../../sync/types';
import {
  INCREMENTAL_INTERVAL_MS,
  MIN_TRIGGER_GAP_MS,
  RECONCILE_INTERVAL_MS,
} from '../../sync/constants';
import { SearchService } from '../../search/service';
import { CredentialStore } from '../../integrations/credential-store';
import { IntegrationService } from '../../integrations/service';
import { Provider } from '../../integrations/providers/provider';
import { ProviderRegistry } from '../../integrations/providers/registry';
import {
  AuthType,
  ExternalTask,
  Provider as ProviderId,
  SourceType,
} from '../../integrations/types';
import { TaskPriority, TaskStatus } from '../../tasks/types';

const SECOND = 1000;
const MINUTE = 60 * SECOND;
const START = new Date('2026-10-09T12:00:00Z');

interface EngineCall {
  sourceId: ExternalSourceId;
  pass: 'run' | 'reconcile';
  // minutes since START, on the fake clock
  at: number;
  signal: AbortSignal | undefined;
}

/**
 * Stands in for SyncEngine, with the reconcile pass feature 11 adds. Each run takes `durationMs`
 * on the fake clock and records its outcome on the source through the real IntegrationService, as
 * the engine does, so the scheduler reads real failure counts and retry times.
 */
class FakeEngine implements SchedulerEngine {
  readonly calls: EngineCall[] = [];
  readonly listeners = new Set<SyncProgressListener>();
  durationMs = 0;
  outcome: SyncRunOutcome = SyncRunOutcome.COMPLETED;
  retryAt: Date | null = null;
  // set if two runs of one source ever overlap
  overlapped = false;
  private readonly inFlight = new Set<ExternalSourceId>();

  constructor(private readonly integrations: IntegrationService) {}

  async runSource(sourceId: ExternalSourceId, options: RunOptions = {}): Promise<SyncRunResult> {
    this.calls.push({ sourceId, pass: 'run', at: minutesSinceStart(), signal: options.signal });
    if (this.inFlight.has(sourceId)) this.overlapped = true;
    this.inFlight.add(sourceId);
    try {
      if (this.durationMs > 0) await new Promise((resolve) => setTimeout(resolve, this.durationMs));
      if (options.signal?.aborted) return result(sourceId, SyncRunOutcome.ABORTED);
      switch (this.outcome) {
        case SyncRunOutcome.COMPLETED:
          this.integrations.recordSyncOutcome(sourceId, { ok: true, at: new Date() });
          break;
        case SyncRunOutcome.FAILED:
          this.integrations.recordSyncOutcome(sourceId, {
            ok: false,
            error: 'down',
            countsAsFailure: true,
          });
          break;
        case SyncRunOutcome.RATE_LIMITED:
          this.integrations.recordSyncOutcome(sourceId, {
            ok: false,
            error: 'slow down',
            countsAsFailure: false,
            retryAt: this.retryAt!,
          });
          break;
      }
      return result(sourceId, this.outcome);
    } finally {
      this.inFlight.delete(sourceId);
    }
  }

  async reconcileSource(
    sourceId: ExternalSourceId,
    options: RunOptions = {},
  ): Promise<SyncRunResult> {
    this.calls.push({
      sourceId,
      pass: 'reconcile',
      at: minutesSinceStart(),
      signal: options.signal,
    });
    return result(sourceId, SyncRunOutcome.COMPLETED);
  }

  onProgress(listener: SyncProgressListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  runs(sourceId: ExternalSourceId = linearSourceId): EngineCall[] {
    return this.calls.filter((call) => call.sourceId === sourceId && call.pass === 'run');
  }

  reconciles(sourceId: ExternalSourceId = linearSourceId): EngineCall[] {
    return this.calls.filter((call) => call.sourceId === sourceId && call.pass === 'reconcile');
  }
}

function result(sourceId: ExternalSourceId, outcome: SyncRunOutcome): SyncRunResult {
  return {
    sourceId,
    outcome,
    mode: null,
    pages: 0,
    inserted: 0,
    updated: 0,
    removed: 0,
    skipped: 0,
    changed: [],
    durationMs: 0,
  };
}

function minutesSinceStart(): number {
  return (Date.now() - START.getTime()) / MINUTE;
}

// a second provider, so a test has two integrations: one connected with its source off
function createFakeCalendarProvider(): Provider {
  return {
    id: ProviderId.GOOGLE_CALENDAR,
    supports: [SourceType.EVENTS],
    authMethods: [AuthType.API_KEY],
    async getAccount() {
      return { accountId: 'google-1', label: 'ada@example.com', userId: 'google-1' };
    },
  };
}

let db: BetterSQLite3Database;
let provider: FakeProvider;
let registry: ProviderRegistry;
let credentials: CredentialStore;
let service: IntegrationService;
let engine: FakeEngine;
let scheduler: SyncScheduler;
let linearId: IntegrationId;
let linearSourceId: ExternalSourceId;
let calendarSourceId: ExternalSourceId;

beforeEach(async () => {
  vi.useFakeTimers({ now: START });
  db = createDb();
  provider = createFakeProvider();
  registry = new Map<ProviderId, Provider>([
    [provider.id, provider],
    [ProviderId.GOOGLE_CALENDAR, createFakeCalendarProvider()],
  ]);
  credentials = new CredentialStore(db, { cipher: new FakeCipher() });
  service = new IntegrationService(db, { credentials, providers: registry });
  // connected before the scheduler exists, so neither connect starts a run
  const linear = await service.connectWithApiKey(ProviderId.LINEAR, FAKE_API_KEY);
  linearId = linear.id;
  linearSourceId = linear.sources[0].id;
  const calendar = await service.connectWithApiKey(ProviderId.GOOGLE_CALENDAR, 'key', {
    enable: [],
  });
  calendarSourceId = calendar.sources[0].id;

  engine = new FakeEngine(service);
  scheduler = new SyncScheduler({ engine, integrations: service, logger: quietLogger() });
});

afterEach(async () => {
  // a run still in flight settles once its fake time passes
  const stopping = scheduler.stop();
  await vi.runAllTimersAsync();
  await stopping;
  vi.useRealTimers();
});

function quietLogger() {
  return { info: vi.fn(), warn: vi.fn(), error: vi.fn() };
}

// starts the scheduler and lets the workspace-open pass run
async function start() {
  scheduler.start();
  await vi.advanceTimersByTimeAsync(0);
}

function source(sourceId: ExternalSourceId = linearSourceId) {
  return db.select().from(externalSources).where(eq(externalSources.id, sourceId)).get()!;
}

describe('SyncScheduler — start', () => {
  it('runs each enabled source once, with the reconcile pass; a disabled source never runs', async () => {
    await start();

    expect(engine.runs()).toHaveLength(1);
    expect(engine.reconciles()).toHaveLength(1);
    expect(engine.runs(calendarSourceId)).toEqual([]);

    await vi.advanceTimersByTimeAsync(RECONCILE_INTERVAL_MS);
    expect(engine.runs(calendarSourceId)).toEqual([]);
    expect(engine.reconciles(calendarSourceId)).toEqual([]);
  });

  it('a source of a disabled integration does not run', async () => {
    await service.setEnabled(linearId, false);
    await start();

    expect(engine.calls).toEqual([]);
  });

  it('runs nothing until the next tick, so a stop straight after start sends nothing', async () => {
    scheduler.start();
    await scheduler.stop();
    await vi.advanceTimersByTimeAsync(RECONCILE_INTERVAL_MS);

    expect(engine.calls).toEqual([]);
  });

  it('a second start while started does nothing', async () => {
    await start();
    scheduler.start();
    await vi.advanceTimersByTimeAsync(0);

    expect(engine.runs()).toHaveLength(1);
  });

  it('triggers before start do nothing', async () => {
    await scheduler.trigger('manual');

    expect(engine.calls).toEqual([]);
  });
});

describe('SyncScheduler — intervals', () => {
  it('runs an incremental sync every 5 minutes and reconciles every 30', async () => {
    await start();

    await vi.advanceTimersByTimeAsync(INCREMENTAL_INTERVAL_MS - 1);
    expect(engine.runs()).toHaveLength(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(engine.runs().map((call) => call.at)).toEqual([0, 5]);
    expect(engine.reconciles()).toHaveLength(1);

    await vi.advanceTimersByTimeAsync(RECONCILE_INTERVAL_MS - INCREMENTAL_INTERVAL_MS);
    // one run per 5-minute mark; the 30-minute one also reconciles, without a second run
    expect(engine.runs().map((call) => call.at)).toEqual([0, 5, 10, 15, 20, 25, 30]);
    expect(engine.reconciles().map((call) => call.at)).toEqual([0, 30]);

    await vi.advanceTimersByTimeAsync(RECONCILE_INTERVAL_MS);
    expect(engine.reconciles().map((call) => call.at)).toEqual([0, 30, 60]);
  });

  it('a tick while the source is running starts no second run', async () => {
    engine.durationMs = 7 * MINUTE;
    await start();

    await vi.advanceTimersByTimeAsync(INCREMENTAL_INTERVAL_MS);
    expect(engine.runs()).toHaveLength(1);
    expect(engine.overlapped).toBe(false);
  });
});

describe('SyncScheduler — triggers', () => {
  it('two focus triggers within 60 seconds cause one run', async () => {
    await start();
    // past the gap after the open pass, and short of the first tick
    await vi.advanceTimersByTimeAsync(2 * MINUTE);

    await scheduler.trigger('focus');
    await vi.advanceTimersByTimeAsync(30 * SECOND);
    await scheduler.trigger('focus');

    expect(engine.runs().map((call) => call.at)).toEqual([0, 2]);
    // an incremental run; only the open pass reconciled
    expect(engine.reconciles()).toHaveLength(1);
  });

  it('focus and resume share the gap, measured from when the last run finished', async () => {
    engine.durationMs = 2 * MINUTE;
    await start();
    await vi.advanceTimersByTimeAsync(2 * MINUTE + 30 * SECOND);

    // the open pass started at 0 but finished at 2 minutes, 30 seconds ago
    await scheduler.trigger('resume');
    expect(engine.runs()).toHaveLength(1);

    await vi.advanceTimersByTimeAsync(MIN_TRIGGER_GAP_MS);
    void scheduler.trigger('resume');
    await vi.advanceTimersByTimeAsync(0);
    expect(engine.runs()).toHaveLength(2);
  });

  it('a manual sync always runs, inside the gap, and includes the reconcile pass', async () => {
    await start();

    await scheduler.syncNow();

    expect(engine.runs().map((call) => call.at)).toEqual([0, 0]);
    expect(engine.reconciles()).toHaveLength(2);
  });

  it('a manual sync of one source runs only that source', async () => {
    await service.setSourceEnabled(calendarSourceId, true);
    await start();

    await scheduler.syncNow(calendarSourceId);

    expect(engine.runs(calendarSourceId)).toHaveLength(2);
    expect(engine.runs()).toHaveLength(1);
  });

  it('triggers during a run cause exactly one follow-up run', async () => {
    engine.durationMs = 10 * SECOND;
    await start();
    expect(engine.runs()).toHaveLength(1);

    const triggers = [
      scheduler.syncNow(),
      scheduler.trigger('connected', linearSourceId),
      scheduler.syncNow(),
    ];
    await vi.advanceTimersByTimeAsync(10 * SECOND);
    expect(engine.runs()).toHaveLength(2);
    await vi.advanceTimersByTimeAsync(10 * SECOND);
    await Promise.all(triggers);

    await vi.advanceTimersByTimeAsync(MINUTE);
    expect(engine.runs()).toHaveLength(2);
    expect(engine.overlapped).toBe(false);
    // the follow-up reconciles, because a manual sync asked for it
    expect(engine.reconciles()).toHaveLength(2);
  });

  it('connecting a source while started syncs it at once', async () => {
    await start();

    await service.setSourceEnabled(calendarSourceId, true);
    await vi.advanceTimersByTimeAsync(0);

    expect(engine.runs(calendarSourceId)).toHaveLength(1);
  });

  it('switching a source off aborts its run', async () => {
    engine.durationMs = MINUTE;
    await start();
    const [run] = engine.runs();

    await service.setSourceEnabled(linearSourceId, false);

    expect(run.signal?.aborted).toBe(true);
    await vi.advanceTimersByTimeAsync(MINUTE);
    // an aborted run records nothing
    expect(source().lastSyncedAt).toBeNull();
  });

  it('a source switched off and straight back on syncs again once the aborted run settles', async () => {
    engine.durationMs = MINUTE;
    await start();

    await service.setSourceEnabled(linearSourceId, false);
    await service.setSourceEnabled(linearSourceId, true);
    expect(engine.runs()).toHaveLength(1);

    await vi.advanceTimersByTimeAsync(MINUTE);
    expect(engine.runs()).toHaveLength(2);
    expect(engine.overlapped).toBe(false);
    await vi.advanceTimersByTimeAsync(MINUTE);
    expect(source().lastSyncedAt).not.toBeNull();
  });

  it('disabling the integration aborts its runs, and needs_reauth stops scheduling them', async () => {
    engine.durationMs = MINUTE;
    await start();
    const [run] = engine.runs();

    service.markNeedsReauth(linearId);
    expect(run.signal?.aborted).toBe(true);

    await vi.advanceTimersByTimeAsync(RECONCILE_INTERVAL_MS);
    await scheduler.trigger('focus');
    expect(engine.runs()).toHaveLength(1);
  });
});

describe('SyncScheduler — backoff', () => {
  it('waits 1 minute after a failure, doubling to a 30-minute cap', () => {
    expect([0, 1, 2, 3, 4, 5, 6, 7].map((failures) => backoffDelay(failures) / MINUTE)).toEqual([
      0, 1, 2, 4, 8, 16, 30, 30,
    ]);
  });

  it('skips interval ticks while failures in a row say wait', async () => {
    engine.outcome = SyncRunOutcome.FAILED;
    await start();

    await vi.advanceTimersByTimeAsync(80 * MINUTE);

    // waits of 1, 2 and 4 minutes fit inside a tick; then 8, 16 and 30 skip ticks
    expect(engine.runs().map((call) => call.at)).toEqual([0, 5, 10, 15, 25, 45, 75]);
    expect(source().consecutiveFailures).toBe(7);
  });

  it('backoff applies to focus too', async () => {
    engine.outcome = SyncRunOutcome.FAILED;
    await start();
    await vi.advanceTimersByTimeAsync(15 * MINUTE);
    // four failures: the next run waits 8 minutes from 15
    expect(source().consecutiveFailures).toBe(4);

    await vi.advanceTimersByTimeAsync(2 * MINUTE);
    await scheduler.trigger('focus');
    expect(engine.runs()).toHaveLength(4);
  });

  it('a manual sync ignores the backoff and restarts it', async () => {
    engine.outcome = SyncRunOutcome.FAILED;
    await start();
    await vi.advanceTimersByTimeAsync(16 * MINUTE);
    expect(source().consecutiveFailures).toBe(4);

    // inside the 8-minute wait
    await scheduler.syncNow();
    expect(engine.runs().map((call) => call.at)).toEqual([0, 5, 10, 15, 16]);

    // failed again, but the wait starts over at 1 minute, so the 20-minute tick runs
    await vi.advanceTimersByTimeAsync(4 * MINUTE);
    expect(engine.runs().map((call) => call.at)).toEqual([0, 5, 10, 15, 16, 20]);

    // a success clears the count; the ticks after it run as usual
    engine.outcome = SyncRunOutcome.COMPLETED;
    await vi.advanceTimersByTimeAsync(5 * MINUTE);
    await vi.advanceTimersByTimeAsync(10 * MINUTE);
    expect(engine.runs().map((call) => call.at)).toEqual([0, 5, 10, 15, 16, 20, 25, 30, 35]);
    expect(source().consecutiveFailures).toBe(0);
  });

  it('after a rate limit, nothing but a manual sync runs before the retry time', async () => {
    engine.outcome = SyncRunOutcome.RATE_LIMITED;
    engine.retryAt = new Date(START.getTime() + 12 * MINUTE);
    await start();
    engine.outcome = SyncRunOutcome.COMPLETED;

    await vi.advanceTimersByTimeAsync(10 * MINUTE);
    await scheduler.trigger('focus');
    expect(engine.runs().map((call) => call.at)).toEqual([0]);
    // a rate limit is not a failure, so no backoff follows it
    expect(source().consecutiveFailures).toBe(0);

    await vi.advanceTimersByTimeAsync(5 * MINUTE);
    expect(engine.runs().map((call) => call.at)).toEqual([0, 15]);
  });
});

describe('SyncScheduler — status and progress', () => {
  it('getStatus lists every source with whether it is running', async () => {
    engine.durationMs = MINUTE;
    await start();

    const status = await scheduler.getStatus();
    expect(status).toEqual([
      expect.objectContaining({
        sourceId: linearSourceId,
        integrationId: linearId,
        provider: ProviderId.LINEAR,
        sourceType: SourceType.TASKS,
        enabled: true,
        running: true,
        lastSyncedAt: null,
      }),
      expect.objectContaining({ sourceId: calendarSourceId, enabled: false, running: false }),
    ]);

    await vi.advanceTimersByTimeAsync(MINUTE);
    const [linear] = await scheduler.getStatus();
    expect(linear.running).toBe(false);
    expect(linear.lastSyncedAt).toEqual(new Date(START.getTime() + MINUTE));
  });

  it('onProgress subscribes to the engine', () => {
    const listener = vi.fn();
    const unsubscribe = scheduler.onProgress(listener);
    expect(engine.listeners.has(listener)).toBe(true);
    unsubscribe();
    expect(engine.listeners.has(listener)).toBe(false);
  });
});

describe('SyncScheduler — stop', () => {
  it('resolves only once the run in flight has settled, and leaves no timers', async () => {
    engine.durationMs = 10 * SECOND;
    await start();
    const [run] = engine.runs();

    let stopped = false;
    const stopping = scheduler.stop().then(() => {
      stopped = true;
    });
    await vi.advanceTimersByTimeAsync(5 * SECOND);
    expect(run.signal?.aborted).toBe(true);
    expect(stopped).toBe(false);

    await vi.advanceTimersByTimeAsync(5 * SECOND);
    await stopping;
    expect(stopped).toBe(true);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('nothing runs or is listened to after stop', async () => {
    await start();
    await scheduler.stop();

    await service.setSourceEnabled(calendarSourceId, true);
    await scheduler.syncNow();
    await vi.advanceTimersByTimeAsync(RECONCILE_INTERVAL_MS);

    expect(engine.runs()).toHaveLength(1);
    expect(engine.runs(calendarSourceId)).toEqual([]);
  });

  it('can be started again after a stop', async () => {
    await start();
    await scheduler.stop();
    await start();

    expect(engine.runs()).toHaveLength(2);
  });
});

describe('SyncScheduler — stop with the real engine', () => {
  let workspacePath: string;

  beforeEach(async () => {
    workspacePath = await fs.mkdtemp(path.join(os.tmpdir(), 'devbrain-sync-scheduler-'));
    const realEngine = new SyncEngine(db, {
      integrations: service,
      credentials,
      providers: registry,
      writer: new SyncWriter(db, new SearchService(db, workspacePath)),
      logger: quietLogger(),
    });
    scheduler = new SyncScheduler({
      engine: realEngine,
      integrations: service,
      logger: quietLogger(),
    });
  });

  afterEach(async () => {
    await fs.rm(workspacePath, { recursive: true, force: true });
  });

  it('a stop during a pull writes nothing after it resolves and leaves no timers', async () => {
    provider.tasks.script({ tasks: [issue()], delayMs: 10 * SECOND });
    await start();
    expect(provider.tasks.pulls).toHaveLength(1);

    const stopping = scheduler.stop();
    // the provider answers after the stop: its page is discarded
    await vi.advanceTimersByTimeAsync(10 * SECOND);
    await stopping;

    expect(vi.getTimerCount()).toBe(0);
    expect(db.select().from(tasksTable).all()).toEqual([]);
    expect(source()).toMatchObject({
      cursor: null,
      lastSyncedAt: null,
      lastError: null,
      consecutiveFailures: 0,
    });

    await vi.advanceTimersByTimeAsync(RECONCILE_INTERVAL_MS);
    expect(provider.tasks.pulls).toHaveLength(1);
  });
});

function issue(): ExternalTask {
  return {
    externalId: 'issue-1',
    key: 'ENG-1',
    url: 'https://linear.app/acme/issue/ENG-1',
    title: 'Issue 1',
    description: null,
    status: TaskStatus.NOT_STARTED,
    priority: TaskPriority.LOW,
    statusLabel: 'Todo',
    priorityLabel: 'Low',
    startDate: null,
    dueDate: null,
    completedAt: null,
    createdAt: START,
    updatedAt: START,
    parentExternalId: null,
    parentKey: null,
    parentTitle: null,
    projectExternalId: null,
    assignedToViewer: true,
  };
}
