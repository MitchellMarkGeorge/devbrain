import { describe, it, expect, vi } from 'vitest';
import { performance } from 'node:perf_hooks';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { CalendarId, ExternalSourceId, IntegrationId } from '@common/ids';
import { calendars } from '@main/db/schema/calendars';
import { externalSources, integrations as integrationsTable } from '@main/db/schema/integrations';
import { createDb } from '../utils';
import { FakeCipher } from '../__mocks__/fake-cipher';
import { createFakeProvider, FakeProvider, fakeRegistry, FAKE_API_KEY } from './fake-provider';
import { SyncWriter } from '../../sync/writer';
import { SyncStateManager } from '../../sync/sync-state';
import { TaskReconciler } from '../../sync/task-reconciler';
import { SearchService } from '../../search/service';
import { CredentialStore } from '../../integrations/credential-store';
import { IntegrationService } from '../../integrations/service';
import { Auth } from '../../integrations/auth';
import {
  AuthType,
  ExternalEvent,
  ExternalProject,
  ExternalTask,
  Provider,
  SourceType,
} from '../../integrations/types';
import { EventKind, EventStatus } from '../../events/types';
import { EVENTS_PAGE_SIZE } from '../../sync/constants';
import { EventPageItems } from '../../sync/types';
import { TaskPriority, TaskStatus } from '../../tasks/types';
import { ProjectStatus } from '../../projects/types';

// How long sync's synchronous writes hold the main process with 5,000 tasks or events, on an
// in-memory database. Opt in with DEVBRAIN_PERF=1 (and --silent=false to see each case's
// timings). The measured numbers and their budgets are in docs/integrations/tech-design.md,
// "Database concurrency"; the bounds here are looser than the budgets, so a slow machine passes
// and a cost that grows with the table again does not.

const RUN = process.env.DEVBRAIN_PERF === '1';

const TASKS = 5_000;
const PAGE_SIZE = 50; // a tasks page; PAGE_SIZE in sync/constants
const EVENTS = 5_000;
const PROJECTS = 25;
const CREATED = new Date('2026-01-15T09:00:00Z');

// a deterministic shuffle, so every run applies the same pages
function seeded(seed: number) {
  let state = seed;
  return () => {
    state = (state * 1_103_515_245 + 12_345) % 2 ** 31;
    return state / 2 ** 31;
  };
}

/**
 * A source of TASKS issues in PROJECTS projects, in pages as an initial pass hands them out
 * (oldest change first). About a third are sub-issues, and the order is shuffled, so most
 * sub-issues meet their parent in another page and many come before it: the adoption path.
 */
function dataset() {
  const random = seeded(42);
  const projects: ExternalProject[] = Array.from({ length: PROJECTS }, (_, i) => ({
    externalId: `project-${i}`,
    url: `https://linear.app/acme/project/project-${i}`,
    title: `Project ${i}`,
    description: 'A project with a description long enough to be indexed as a real one would be.',
    status: ProjectStatus.ACTIVE,
    statusLabel: 'Started',
    startDate: null,
    dueDate: null,
    color: '#5e6ad2',
    completedAt: null,
    createdAt: CREATED,
    updatedAt: CREATED,
  }));
  const tasks: ExternalTask[] = [];
  for (let i = 0; i < TASKS; i++) {
    const parent = i > 0 && random() < 0.33 ? tasks[Math.floor(random() * i)] : undefined;
    tasks.push({
      externalId: `issue-${i}`,
      key: `ENG-${i}`,
      url: `https://linear.app/acme/issue/ENG-${i}`,
      title: `Issue ${i}: fix the thing in the module that does the work`,
      description:
        'Steps to reproduce: open the app, click the button, and see the error. Expected the ' +
        'page to load. Seen on macOS and Windows, both on the latest build.',
      status: TaskStatus.NOT_STARTED,
      priority: TaskPriority.MEDIUM,
      statusLabel: 'Todo',
      priorityLabel: 'Medium',
      startDate: null,
      dueDate: null,
      completedAt: null,
      createdAt: CREATED,
      updatedAt: CREATED,
      parentExternalId: parent?.externalId ?? null,
      parentKey: parent?.key ?? null,
      parentTitle: parent?.title ?? null,
      projectExternalId: `project-${Math.floor(random() * PROJECTS)}`,
      assignedToViewer: true,
    });
  }
  for (let i = tasks.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [tasks[i], tasks[j]] = [tasks[j], tasks[i]];
  }
  const byId = new Map(projects.map((project) => [project.externalId, project]));
  const pages = [];
  for (let start = 0; start < tasks.length; start += PAGE_SIZE) {
    const items = tasks
      .slice(start, start + PAGE_SIZE)
      .map((task, i) => ({ ...task, updatedAt: new Date(CREATED.getTime() + start + i + 1) }));
    // a page carries the projects of its tasks, as the provider's does
    const ids = new Set(items.map((task) => task.projectExternalId!));
    pages.push({
      tasks: items,
      projects: [...ids].map((id) => byId.get(id)!),
      removedIds: [] as string[],
    });
  }
  return { pages, tasks: pages.flatMap((page) => page.tasks), projects };
}

/**
 * EVENTS events of one calendar in pages of EVENTS_PAGE_SIZE: a tenth are series masters, three
 * tenths moved occurrences of them and a twentieth cancelled ones, shuffled, so many occurrences
 * come before their master (the series adoption path).
 */
function eventDataset() {
  const random = seeded(7);
  const items: ExternalEvent[] = [];
  const masters: ExternalEvent[] = [];
  for (let i = 0; i < EVENTS; i++) {
    const start = new Date(Date.UTC(2026, 9, 1) + i * 3_600_000);
    const roll = random();
    const series = masters.length > 0 ? masters[Math.floor(random() * masters.length)] : undefined;
    const occurrence = series !== undefined && roll < 0.35;
    const item: ExternalEvent = {
      externalId: `ada@example.com:event-${i}`,
      calendarId: 'ada@example.com',
      url: `https://www.google.com/calendar/event?eid=${i}`,
      title: `Event ${i}: planning with the team`,
      description: 'Agenda: status, blockers, next steps. Notes are in the shared doc.',
      startAt: start,
      endAt: new Date(start.getTime() + 1_800_000),
      allDay: false,
      startDate: null,
      endDate: null,
      timeZone: 'UTC',
      location: null,
      recurrenceRule: !occurrence && roll > 0.9 ? 'RRULE:FREQ=WEEKLY;BYDAY=MO' : null,
      recurringEventExternalId: occurrence ? series.externalId : null,
      originalStartAt: occurrence ? start : null,
      meetingUrl: null,
      color: null,
      status: EventStatus.CONFIRMED,
      response: null,
      kind: EventKind.DEFAULT,
      cancelled: occurrence && roll < 0.05,
      createdAt: CREATED,
      updatedAt: CREATED,
    };
    if (item.recurrenceRule) masters.push(item);
    items.push(item);
  }
  for (let i = items.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [items[i], items[j]] = [items[j], items[i]];
  }
  // an initial import is a full pass: its last page sweeps what no page listed
  const startedAt = new Date();
  const pages: EventPageItems[] = [];
  for (let start = 0; start < items.length; start += EVENTS_PAGE_SIZE) {
    pages.push({
      events: items.slice(start, start + EVENTS_PAGE_SIZE),
      cancelledIds: [],
      skippedIds: [],
      fullPass: {
        startedAt,
        from: new Date(Date.UTC(2026, 8, 1)),
        last: start + EVENTS_PAGE_SIZE >= items.length,
      },
    });
  }
  return { pages, masters };
}

async function workspace() {
  const workspacePath = await fs.mkdtemp(path.join(os.tmpdir(), 'devbrain-sync-perf-'));
  const db = createDb();
  const linear: FakeProvider = createFakeProvider();
  const providers = fakeRegistry(linear);
  const credentials = new CredentialStore(db, { cipher: new FakeCipher() });
  const search = new SearchService(db, workspacePath);
  const integrations = new IntegrationService(db, { credentials, providers });
  // as Workspace does: deleted items leave search in the disconnect's own transaction
  integrations.onChange((change) => {
    if (change.type !== 'disconnected') return;
    const { taskIds, projectIds, eventIds } = change.deleted;
    search.removeFromIndex([...taskIds, ...projectIds, ...eventIds]);
  });
  const writer = new SyncWriter(db, search);
  const logger = { info: vi.fn(), warn: vi.fn(), error: vi.fn() };
  const reconciler = new TaskReconciler({
    db,
    syncState: new SyncStateManager(db),
    credentials,
    providers,
    writer,
    logger,
  });
  const integration = await integrations.connectWithApiKey(Provider.LINEAR, FAKE_API_KEY);
  const cleanup = () => fs.rm(workspacePath, { recursive: true, force: true });
  // an events source with its calendar, written directly: the writer is all an events page uses
  const calendarSource = () => {
    const integrationId = db
      .insert(integrationsTable)
      .values({
        provider: Provider.GOOGLE_CALENDAR,
        authType: AuthType.OAUTH,
        accountId: 'subject-1',
        accountLabel: 'ada@example.com',
        credentials: Buffer.from('ciphertext'),
      })
      .returning()
      .get().id;
    const sourceId = db
      .insert(externalSources)
      .values({ integrationId, sourceType: SourceType.EVENTS })
      .returning()
      .get().id;
    const calendarId: CalendarId = db
      .insert(calendars)
      .values({ sourceId, externalId: 'ada@example.com', name: 'Ada', isPrimary: true })
      .returning()
      .get().id;
    return { sourceId, calendarId };
  };
  return {
    writer,
    reconciler,
    calendarSource,
    integrations,
    linear,
    integrationId: integration.id as IntegrationId,
    sourceId: integration.sources[0].id as ExternalSourceId,
    cleanup,
  };
}

function time<T>(fn: () => T): { result: T; ms: number } {
  const start = performance.now();
  const result = fn();
  return { result, ms: performance.now() - start };
}

async function timeAsync<T>(fn: () => Promise<T>): Promise<{ result: T; ms: number }> {
  const start = performance.now();
  const result = await fn();
  return { result, ms: performance.now() - start };
}

const mean = (values: number[]) => values.reduce((sum, value) => sum + value, 0) / values.length;
const round = (ms: number) => Math.round(ms * 10) / 10;

function pageStats(times: number[]) {
  const sorted = [...times].sort((a, b) => a - b);
  return {
    pages: times.length,
    'first 10 (mean ms)': round(mean(times.slice(0, 10))),
    'last 10 (mean ms)': round(mean(times.slice(-10))),
    'p95 (ms)': round(sorted[Math.floor(sorted.length * 0.95)]),
    'max (ms)': round(sorted[sorted.length - 1]),
    'total (ms)': round(times.reduce((sum, ms) => sum + ms, 0)),
  };
}

async function imported() {
  const ws = await workspace();
  const data = dataset();
  // a first page warms the statement cache, as the app's first run would
  const times = data.pages.map((page) => time(() => ws.writer.applyTaskPage(ws.sourceId, page)).ms);
  return { ...ws, data, times };
}

describe.skipIf(!RUN)('sync performance — 5,000 items', () => {
  it('initial import: page time stays flat as the table grows', async () => {
    const { times, cleanup } = await imported();
    const stats = pageStats(times);
    console.table({ 'initial import': stats });
    // flat: the last pages cost about what the first did, never several times more
    expect(stats['last 10 (mean ms)']).toBeLessThan(stats['first 10 (mean ms)'] * 3 + 10);
    expect(stats['p95 (ms)']).toBeLessThan(150);
    await cleanup();
  }, 120_000);

  it('incremental page and reconcile at 5,000 tasks', async () => {
    const ws = await imported();
    const { data, writer, reconciler, linear, sourceId } = ws;
    const auth: Auth = { authorization: FAKE_API_KEY };

    // incremental pages of 50 changed issues each, ten of them; the median is reported
    const incrementalTimes = Array.from({ length: 10 }, (_, n) => {
      const changed = data.tasks.slice(n * PAGE_SIZE, (n + 1) * PAGE_SIZE).map((task) => ({
        ...task,
        title: `${task.title} (edited)`,
        updatedAt: new Date(task.updatedAt.getTime() + 60_000),
      }));
      return time(() =>
        writer.applyTaskPage(sourceId, { tasks: changed, projects: [], removedIds: [] }),
      ).ms;
    }).sort((a, b) => a - b);
    const incremental = incrementalTimes[5];

    // a quiet reconcile: the snapshot matches, so nothing is resolved
    linear.tasks.assigned = data.tasks.map((task) => task.externalId);
    linear.tasks.respondToLookup = () => ({});
    const quietPlan = await timeAsync(() => reconciler.reconcile(sourceId, linear.tasks, auth));
    const quietApply = time(() => quietPlan.result!.apply()).ms;

    // a busy one: 200 issues left the snapshot; half are gone, half come back completed
    const left = data.tasks.slice(1_000, 1_200);
    linear.tasks.assigned = data.tasks.slice(0, 1_000).map((task) => task.externalId);
    linear.tasks.assigned.push(...data.tasks.slice(1_200).map((task) => task.externalId));
    linear.tasks.respondToLookup = ({ externalIds, projectIds }) => ({
      tasks: left
        .slice(100)
        .filter((task) => externalIds.includes(task.externalId))
        .map((task) => ({
          ...task,
          status: TaskStatus.COMPLETED,
          completedAt: new Date(),
          updatedAt: new Date(),
        })),
      gone: left
        .slice(0, 100)
        .map((task) => task.externalId)
        .filter((id) => externalIds.includes(id)),
      projects: data.projects.filter((project) => projectIds.includes(project.externalId)),
    });
    const busyPlan = await timeAsync(() => reconciler.reconcile(sourceId, linear.tasks, auth));
    const busyApply = time(() => busyPlan.result!.apply()).ms;

    const results = {
      'incremental page, 50 changed (median of 10)': round(incremental),
      'reconcile, nothing to resolve: plan': round(quietPlan.ms),
      'reconcile, nothing to resolve: apply': round(quietApply),
      'reconcile, 200 resolved: plan': round(busyPlan.ms),
      'reconcile, 200 resolved: apply': round(busyApply),
    };
    console.table(results);
    expect(incremental).toBeLessThan(150);
    expect(quietPlan.ms + quietApply).toBeLessThan(500);
    expect(busyPlan.ms + busyApply).toBeLessThan(1_000);
    await ws.cleanup();
  }, 120_000);

  it.each([false, true])(
    'disconnect, keepLocalCopies: %s',
    async (keepLocalCopies) => {
      const ws = await imported();
      const preview = await timeAsync(() => ws.integrations.previewDisconnect(ws.integrationId));
      const disconnect = await timeAsync(() =>
        ws.integrations.disconnect(ws.integrationId, { keepLocalCopies }),
      );
      console.table({
        [`disconnect (keepLocalCopies: ${keepLocalCopies})`]: {
          'preview (ms)': round(preview.ms),
          'disconnect (ms)': round(disconnect.ms),
        },
      });
      expect(disconnect.result.deleted.tasks + disconnect.result.kept.tasks).toBe(TASKS);
      expect(preview.ms).toBeLessThan(1_000);
      expect(disconnect.ms).toBeLessThan(3_000);
      await ws.cleanup();
    },
    120_000,
  );

  it('event import: page time stays flat as the table grows, and a cancelled series', async () => {
    const ws = await workspace();
    const { sourceId, calendarId } = ws.calendarSource();
    const { pages, masters } = eventDataset();
    const times = pages.map(
      (page) => time(() => ws.writer.applyEventPage(sourceId, calendarId, page)).ms,
    );
    const stats = pageStats(times);
    // cancelling a tenth of the series takes their occurrence rows with them
    const cancelled = masters.slice(0, Math.ceil(masters.length / 10)).map((m) => m.externalId);
    const removal = time(() =>
      ws.writer.applyEventPage(sourceId, calendarId, {
        events: [],
        cancelledIds: cancelled,
        skippedIds: [],
        fullPass: null,
      }),
    ).ms;
    console.table({ [`event import (${EVENTS_PAGE_SIZE} a page)`]: stats });
    console.table({ [`${cancelled.length} series cancelled`]: { 'page (ms)': round(removal) } });
    expect(stats['last 10 (mean ms)']).toBeLessThan(stats['first 10 (mean ms)'] * 3 + 10);
    expect(stats['p95 (ms)']).toBeLessThan(500);
    expect(removal).toBeLessThan(500);
    await ws.cleanup();
  }, 120_000);
});
