import { describe, it, expect, beforeEach, afterEach, vi, Mock } from 'vitest';
import { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { and, eq } from 'drizzle-orm';
import { ExternalSourceId, IntegrationId } from '@common/ids';
import { externalLinks, externalSources, integrations } from '@main/db/schema/integrations';
import { tasks as tasksTable } from '@main/db/schema/tasks';
import { projects as projectsTable } from '@main/db/schema/projects';
import { createDb } from '../utils';
import { FakeCipher } from '../__mocks__/fake-cipher';
import { scriptedFetch } from '../integrations/linear/fake-fetch';
import viewerFixture from '../integrations/fixtures/linear/viewer.json';
import issueFixture from '../integrations/fixtures/linear/issue.json';
import { createFakeProvider, FAKE_API_KEY, FakeProvider, fakeRegistry } from './fake-provider';
import { SyncEngine } from '../../sync/engine';
import { SyncWriter } from '../../sync/writer';
import { SyncProgress } from '../../sync/types';
import { CURSOR_OVERLAP_MS } from '../../sync/constants';
import { SearchService } from '../../search/service';
import { CredentialStore } from '../../integrations/credential-store';
import { IntegrationChange, IntegrationService } from '../../integrations/service';
import { Provider } from '../../integrations/providers/provider';
import { createLinearProvider } from '../../integrations/providers/linear';
import {
  ExternalProject,
  ExternalTask,
  IntegrationStatus,
  LinkState,
  Provider as ProviderId,
} from '../../integrations/types';
import { TaskPriority, TaskStatus } from '../../tasks/types';
import { ProjectStatus } from '../../projects/types';
import {
  IntegrationAuthError,
  ProviderUnavailableError,
  RateLimitError,
} from '../../shared/errors';

const CREATED = new Date('2026-01-15T09:00:00Z');
const V1 = new Date('2026-10-01T12:00:00Z');
const V2 = new Date('2026-10-02T12:00:00Z');
const V3 = new Date('2026-10-03T12:00:00Z');
const NOW = new Date('2026-10-09T12:00:00Z');

let db: BetterSQLite3Database;
let workspacePath: string;
let provider: FakeProvider;
let service: IntegrationService;
let writer: SyncWriter;
let engine: SyncEngine;
type LogFn = (...params: unknown[]) => void;
let logger: { info: Mock<LogFn>; warn: Mock<LogFn> };
let clock: Date;
let changes: IntegrationChange[];
let progress: SyncProgress[];
let integrationId: IntegrationId;
let sourceId: ExternalSourceId;
let itemCount = 0;

function issue(overrides: Partial<ExternalTask> = {}): ExternalTask {
  itemCount += 1;
  return {
    externalId: `issue-${itemCount}`,
    key: `ENG-${itemCount}`,
    url: `https://linear.app/acme/issue/ENG-${itemCount}`,
    title: `Issue ${itemCount}`,
    description: null,
    status: TaskStatus.NOT_STARTED,
    priority: TaskPriority.LOW,
    statusLabel: 'Todo',
    priorityLabel: 'Low',
    startDate: null,
    dueDate: null,
    completedAt: null,
    createdAt: CREATED,
    updatedAt: V1,
    parentExternalId: null,
    parentKey: null,
    parentTitle: null,
    projectExternalId: null,
    assignedToViewer: true,
    ...overrides,
  };
}

function project(overrides: Partial<ExternalProject> = {}): ExternalProject {
  itemCount += 1;
  return {
    externalId: `project-${itemCount}`,
    url: `https://linear.app/acme/project/project-${itemCount}`,
    title: `Project ${itemCount}`,
    description: null,
    status: ProjectStatus.ACTIVE,
    statusLabel: 'Started',
    startDate: null,
    dueDate: null,
    color: null,
    completedAt: null,
    createdAt: CREATED,
    updatedAt: V1,
    ...overrides,
  };
}

// builds the services around `registryProvider` and connects through connectWithApiKey
async function setup(registryProvider: Provider, apiKey = FAKE_API_KEY) {
  db = createDb();
  const credentials = new CredentialStore(db, { cipher: new FakeCipher() });
  service = new IntegrationService(db, { credentials, providers: fakeRegistry(registryProvider) });
  writer = new SyncWriter(db, new SearchService(db, workspacePath));
  logger = { info: vi.fn<LogFn>(), warn: vi.fn<LogFn>() };
  clock = NOW;
  engine = new SyncEngine(db, {
    integrations: service,
    credentials,
    providers: fakeRegistry(registryProvider),
    writer,
    logger,
    now: () => clock,
  });
  const integration = await service.connectWithApiKey(ProviderId.LINEAR, apiKey);
  integrationId = integration.id;
  sourceId = integration.sources[0].id;
  changes = [];
  service.onChange((change) => changes.push(change));
  progress = [];
  engine.onProgress((event) => progress.push(event));
}

function sourceRow() {
  return db.select().from(externalSources).where(eq(externalSources.id, sourceId)).get()!;
}

function integrationStatus(): IntegrationStatus {
  return db.select().from(integrations).where(eq(integrations.id, integrationId)).get()!.status;
}

function linkOf(externalId: string) {
  return db
    .select()
    .from(externalLinks)
    .where(and(eq(externalLinks.sourceId, sourceId), eq(externalLinks.externalId, externalId)))
    .get();
}

function taskTitles(): string[] {
  return db
    .select({ title: tasksTable.title })
    .from(tasksTable)
    .all()
    .map((row) => row.title)
    .sort();
}

function storeCursor(cursor: unknown, initialSyncCompletedAt: Date | null = V1) {
  db.update(externalSources)
    .set({ cursor, initialSyncCompletedAt })
    .where(eq(externalSources.id, sourceId))
    .run();
}

function logLines(): string[] {
  return [...logger.info.mock.calls, ...logger.warn.mock.calls].map((call) => String(call[0]));
}

beforeEach(async () => {
  workspacePath = await fs.mkdtemp(path.join(os.tmpdir(), 'devbrain-sync-engine-'));
  provider = createFakeProvider();
  await setup(provider);
});

afterEach(async () => {
  await fs.rm(workspacePath, { recursive: true, force: true });
});

describe('SyncEngine — initial sync', () => {
  it('mirrors a three-page initial sync and ends in incremental mode', async () => {
    const proj = project();
    // the highest updatedAt is on the first page, so it must be carried across the walk
    const pages = [
      [issue({ title: 'One', updatedAt: V3, projectExternalId: proj.externalId })],
      [issue({ title: 'Two', updatedAt: V1 }), issue({ title: 'Three', updatedAt: V2 })],
      [issue({ title: 'Four', updatedAt: V1 })],
    ];
    provider.tasks.script(
      { tasks: pages[0], projects: [proj], done: false },
      { tasks: pages[1], done: false },
      { tasks: pages[2] },
    );

    const result = await engine.runSource(sourceId);

    expect(result).toMatchObject({
      outcome: 'completed',
      mode: 'initial',
      pages: 3,
      inserted: 5,
      updated: 0,
      removed: 0,
      skipped: 0,
    });
    expect(result.changed.sort()).toEqual(['project', 'task']);
    expect(taskTitles()).toEqual(['Four', 'One', 'Three', 'Two']);
    expect(db.select().from(projectsTable).all()).toHaveLength(1);

    // each pull resumed where the previous page ended
    expect(provider.tasks.pulls.map((pull) => pull.cursor)).toEqual([
      null,
      { mode: 'initial', after: 'page-1', maxUpdatedAt: V3.toISOString() },
      { mode: 'initial', after: 'page-2', maxUpdatedAt: V3.toISOString() },
    ]);
    expect(provider.tasks.pulls[0].auth).toEqual({ authorization: FAKE_API_KEY });

    const source = sourceRow();
    expect(source.cursor).toEqual({
      mode: 'incremental',
      updatedSince: new Date(V3.getTime() - CURSOR_OVERLAP_MS).toISOString(),
    });
    expect(source.initialSyncCompletedAt).toEqual(NOW);
    expect(source.lastSyncedAt).toEqual(NOW);
    expect(source.lastError).toBeNull();
    expect(source.consecutiveFailures).toBe(0);
  });

  it('tracks the highest updatedAt across every page of a real Linear walk', async () => {
    // the Linear provider carries maxUpdatedAt in its cursor; the engine stores what it returns
    const page = (nodes: unknown[], endCursor: string | null) => ({
      body: {
        data: {
          viewer: {
            id: viewerFixture.data.viewer.id,
            assignedIssues: { pageInfo: { hasNextPage: endCursor !== null, endCursor }, nodes },
          },
        },
      },
    });
    const node = (id: string, updatedAt: string) => ({ ...issueFixture, id, updatedAt });
    const fetch = scriptedFetch([
      { body: viewerFixture },
      page([node('a', '2026-10-06T09:00:00.000Z')], 'c1'),
      page([node('b', '2026-10-04T09:00:00.000Z')], null),
    ]);
    await setup(createLinearProvider({ fetch, now: () => NOW }), 'lin_api_test');

    const result = await engine.runSource(sourceId);

    expect(result).toMatchObject({ outcome: 'completed', mode: 'initial', pages: 2 });
    expect(sourceRow().cursor).toEqual({
      mode: 'incremental',
      updatedSince: '2026-10-06T08:59:00.000Z',
    });
    expect(sourceRow().initialSyncCompletedAt).toEqual(NOW);
    // two issues, and the parent-less project they share
    expect(db.select().from(tasksTable).all()).toHaveLength(2);
    expect(fetch.requests[2].variables.after).toBe('c1');
  });

  it('counts the items the provider skipped in the run summary', async () => {
    provider.tasks.script(
      { tasks: [issue()], skipped: 2, done: false },
      { tasks: [issue()], skipped: 1 },
    );

    const result = await engine.runSource(sourceId);

    expect(result).toMatchObject({ outcome: 'completed', inserted: 2, skipped: 3 });
    expect(logLines()[0]).toMatch(/skipped=3/);
  });

  it('starts a fresh initial sync when the stored cursor does not parse', async () => {
    storeCursor({ mode: 'sideways', page: 7 });
    provider.tasks.script({ tasks: [issue({ title: 'Fresh' })] });

    const result = await engine.runSource(sourceId);

    expect(result).toMatchObject({ outcome: 'completed', mode: 'initial' });
    expect(provider.tasks.pulls[0].cursor).toBeNull();
    expect(sourceRow().cursor).toMatchObject({ mode: 'incremental' });
    expect(taskTitles()).toEqual(['Fresh']);
  });

  it('emits progress after each committed page with the writer summary', async () => {
    provider.tasks.script(
      { tasks: [issue(), issue()], done: false },
      { tasks: [issue()], removedIds: ['never-mirrored'] },
    );

    await engine.runSource(sourceId);

    expect(progress).toEqual([
      {
        sourceId,
        phase: 'initial',
        pages: 1,
        summary: { inserted: 2, updated: 0, removed: 0, changed: ['task'] },
        itemsApplied: 2,
      },
      {
        sourceId,
        phase: 'initial',
        pages: 2,
        summary: { inserted: 1, updated: 0, removed: 0, changed: ['task'] },
        itemsApplied: 3,
      },
    ]);
  });

  it('keeps running when a progress listener throws', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
    engine.onProgress(() => {
      throw new Error('listener bug');
    });
    provider.tasks.script({ tasks: [issue()], done: false }, { tasks: [issue()] });

    const result = await engine.runSource(sourceId);

    expect(result).toMatchObject({ outcome: 'completed', pages: 2 });
    expect(consoleError).toHaveBeenCalled();
  });
});

describe('SyncEngine — resume and transactions', () => {
  it('keeps page one and its cursor when page two throws, and resumes at page two', async () => {
    provider.tasks.script(
      { tasks: [issue({ title: 'First' })], done: false },
      { error: new ProviderUnavailableError('Linear is down') },
    );

    const failed = await engine.runSource(sourceId);

    expect(failed).toMatchObject({ outcome: 'failed', mode: 'initial', pages: 1, inserted: 1 });
    expect(failed.error).toBeInstanceOf(ProviderUnavailableError);
    expect(taskTitles()).toEqual(['First']);
    expect(sourceRow()).toMatchObject({
      cursor: { mode: 'initial', after: 'page-1', maxUpdatedAt: V1.toISOString() },
      initialSyncCompletedAt: null,
      lastSyncedAt: null,
      lastError: 'Linear is down',
      consecutiveFailures: 1,
    });

    provider.tasks.script({ tasks: [issue({ title: 'Second' })] });
    const resumed = await engine.runSource(sourceId);

    expect(resumed).toMatchObject({ outcome: 'completed', mode: 'initial', pages: 1 });
    expect(provider.tasks.pulls[2].cursor).toEqual({
      mode: 'initial',
      after: 'page-1',
      maxUpdatedAt: V1.toISOString(),
    });
    expect(taskTitles()).toEqual(['First', 'Second']);
    expect(sourceRow()).toMatchObject({
      initialSyncCompletedAt: NOW,
      lastSyncedAt: NOW,
      lastError: null,
      consecutiveFailures: 0,
    });
  });

  it('rolls back the page when saving its cursor fails after the page was applied', async () => {
    vi.spyOn(service, 'saveCursor').mockImplementationOnce(() => {
      throw new Error('disk full');
    });
    const applied = vi.spyOn(writer, 'applyTaskPage');
    provider.tasks.script({ tasks: [issue({ title: 'Undone' })], projects: [project()] });

    const result = await engine.runSource(sourceId);

    // the writer's transaction committed as a savepoint, then the outer one rolled it back
    expect(applied).toHaveReturnedWith(expect.objectContaining({ inserted: 2 }));
    expect(result).toMatchObject({ outcome: 'failed', pages: 0, inserted: 0 });
    expect(db.select().from(tasksTable).all()).toEqual([]);
    expect(db.select().from(projectsTable).all()).toEqual([]);
    expect(db.select().from(externalLinks).all()).toEqual([]);
    expect(sourceRow()).toMatchObject({ cursor: null, lastError: 'disk full' });
  });

  it('fails the run on a database error while applying a page', async () => {
    provider.tasks.script(
      { tasks: [issue({ title: 'Kept' })], done: false },
      // title is NOT NULL, so the page fails inside the writer
      { tasks: [issue({ title: null as unknown as string })] },
    );

    const result = await engine.runSource(sourceId);

    expect(result).toMatchObject({ outcome: 'failed', pages: 1 });
    expect(taskTitles()).toEqual(['Kept']);
    expect(sourceRow()).toMatchObject({
      cursor: { mode: 'initial', after: 'page-1' },
      consecutiveFailures: 1,
    });
  });
});

describe('SyncEngine — incremental sync', () => {
  const since = new Date(V2.getTime() - CURSOR_OVERLAP_MS).toISOString();

  beforeEach(async () => {
    provider.tasks.script({ tasks: [issue({ externalId: 'kept', title: 'Kept', updatedAt: V2 })] });
    await engine.runSource(sourceId);
    clock = new Date(NOW.getTime() + 5 * 60_000);
  });

  it('writes only lastSyncedAt when nothing changed', async () => {
    const tasksBefore = db.select().from(tasksTable).all();
    const linksBefore = db.select().from(externalLinks).all();
    const before = sourceRow();
    provider.tasks.script({ tasks: [] });

    const result = await engine.runSource(sourceId);

    expect(result).toMatchObject({ outcome: 'completed', mode: 'incremental', pages: 1 });
    expect(provider.tasks.pulls[1].cursor).toEqual({ mode: 'incremental', updatedSince: since });
    expect(db.select().from(tasksTable).all()).toEqual(tasksBefore);
    expect(db.select().from(externalLinks).all()).toEqual(linksBefore);
    expect(sourceRow()).toEqual({ ...before, lastSyncedAt: clock });
  });

  it('re-reading an unchanged item in the overlap moves only its link lastSyncedAt', async () => {
    const tasksBefore = db.select().from(tasksTable).all();
    const seenBefore = linkOf('kept')!.lastSyncedAt;
    await new Promise((resolve) => setTimeout(resolve, 5));
    provider.tasks.script({ tasks: [issue({ externalId: 'kept', title: 'Kept', updatedAt: V2 })] });

    const result = await engine.runSource(sourceId);

    expect(result).toMatchObject({ inserted: 0, updated: 0, removed: 0 });
    expect(db.select().from(tasksTable).all()).toEqual(tasksBefore);
    // the writer stamps links with its own clock
    expect(linkOf('kept')!.lastSyncedAt.getTime()).toBeGreaterThan(seenBefore.getTime());
    // the cursor never moves backwards past the overlap
    expect(sourceRow().cursor).toEqual({ mode: 'incremental', updatedSince: since });
  });

  it('picks up an edit and removes a trashed issue', async () => {
    provider.tasks.script({
      tasks: [issue({ externalId: 'kept', title: 'Renamed', updatedAt: V3 })],
      removedIds: [],
      done: false,
    });
    provider.tasks.script({ tasks: [], removedIds: ['kept'] });

    const result = await engine.runSource(sourceId);

    expect(result).toMatchObject({
      outcome: 'completed',
      mode: 'incremental',
      pages: 2,
      updated: 1,
      removed: 1,
    });
    expect(taskTitles()).toEqual(['Renamed']);
    expect(linkOf('kept')!.state).toBe(LinkState.REMOVED);
    expect(sourceRow().cursor).toEqual({
      mode: 'incremental',
      updatedSince: new Date(V3.getTime() - CURSOR_OVERLAP_MS).toISOString(),
    });
    // a completed initial sync is not stamped again
    expect(sourceRow().initialSyncCompletedAt).toEqual(NOW);
  });
});

describe('SyncEngine — failures', () => {
  it('moves the integration to needs_reauth on rejected credentials; the next run skips', async () => {
    provider.tasks.script({ error: new IntegrationAuthError('Linear rejected the API key') });

    const result = await engine.runSource(sourceId);

    expect(result).toMatchObject({ outcome: 'failed' });
    expect(result.error).toBeInstanceOf(IntegrationAuthError);
    expect(integrationStatus()).toBe(IntegrationStatus.NEEDS_REAUTH);
    expect(sourceRow()).toMatchObject({
      enabled: true,
      lastError: 'Linear rejected the API key',
      consecutiveFailures: 1,
    });
    expect(changes).toContainEqual({
      type: 'status_changed',
      integrationId,
      status: IntegrationStatus.NEEDS_REAUTH,
    });

    const next = await engine.runSource(sourceId);

    expect(next).toMatchObject({ outcome: 'skipped', skipReason: 'needs_reauth' });
    expect(provider.tasks.pulls).toHaveLength(1);
  });

  it('treats unreadable stored credentials as rejected', async () => {
    db.update(integrations)
      .set({ credentials: Buffer.from('garbage') })
      .where(eq(integrations.id, integrationId))
      .run();

    const result = await engine.runSource(sourceId);

    expect(result.error).toBeInstanceOf(IntegrationAuthError);
    expect(integrationStatus()).toBe(IntegrationStatus.NEEDS_REAUTH);
    expect(provider.tasks.pulls).toHaveLength(0);
  });

  it('stores retryAt on a rate limit and does not pull again before it', async () => {
    const retryAt = new Date(NOW.getTime() + 10 * 60_000);
    provider.tasks.script({ error: new RateLimitError(retryAt) });

    const limited = await engine.runSource(sourceId);

    expect(limited).toMatchObject({ outcome: 'rate_limited', retryAt });
    expect(sourceRow()).toMatchObject({ retryAt, consecutiveFailures: 0 });
    expect(sourceRow().lastError).toMatch(/Rate limited/);
    expect(integrationStatus()).toBe(IntegrationStatus.CONNECTED);

    clock = new Date(retryAt.getTime() - 1);
    expect(await engine.runSource(sourceId)).toMatchObject({
      outcome: 'skipped',
      skipReason: 'rate_limited',
    });
    expect(provider.tasks.pulls).toHaveLength(1);

    clock = retryAt;
    provider.tasks.script({ tasks: [issue()] });
    expect(await engine.runSource(sourceId)).toMatchObject({ outcome: 'completed' });
    expect(sourceRow()).toMatchObject({ retryAt: null, lastError: null });
  });

  it('counts consecutive provider failures and resets them on success', async () => {
    provider.tasks.script(
      { error: new ProviderUnavailableError('timeout') },
      { error: new ProviderUnavailableError('timeout') },
    );
    await engine.runSource(sourceId);
    await engine.runSource(sourceId);
    expect(sourceRow().consecutiveFailures).toBe(2);

    provider.tasks.script({ tasks: [] });
    await engine.runSource(sourceId);
    expect(sourceRow()).toMatchObject({ consecutiveFailures: 0, lastError: null });
  });

  it('skips a disabled source and a disabled integration without pulling', async () => {
    await service.setSourceEnabled(sourceId, false);
    expect(await engine.runSource(sourceId)).toMatchObject({
      outcome: 'skipped',
      skipReason: 'source_disabled',
    });

    await service.setSourceEnabled(sourceId, true);
    await service.setEnabled(integrationId, false);
    expect(await engine.runSource(sourceId)).toMatchObject({
      outcome: 'skipped',
      skipReason: 'integration_disabled',
    });

    expect(provider.tasks.pulls).toHaveLength(0);
    expect(sourceRow()).toMatchObject({ lastSyncedAt: null, consecutiveFailures: 0 });
  });
});

describe('SyncEngine — abort and concurrency', () => {
  it('stops between pages on abort, keeping the committed page and its cursor', async () => {
    const controller = new AbortController();
    provider.tasks.script(
      { tasks: [issue({ title: 'Committed' })], done: false },
      // the abort lands while page two is in flight, so page two is discarded
      { tasks: [issue({ title: 'Discarded' })], done: false, onPull: () => controller.abort() },
      { tasks: [issue({ title: 'Never pulled' })] },
    );

    const result = await engine.runSource(sourceId, { signal: controller.signal });

    expect(result).toMatchObject({ outcome: 'aborted', pages: 1, inserted: 1 });
    expect(provider.tasks.pulls).toHaveLength(2);
    expect(taskTitles()).toEqual(['Committed']);
    expect(sourceRow()).toMatchObject({
      cursor: { mode: 'initial', after: 'page-1' },
      lastSyncedAt: null,
      lastError: null,
      consecutiveFailures: 0,
    });
    expect(db.select().from(externalLinks).all()).toHaveLength(1);

    // the next run picks up at page two
    provider.tasks.pulls.length = 0;
    provider.tasks.script({ tasks: [issue({ title: 'Resumed' })] });
    await engine.runSource(sourceId);
    expect(provider.tasks.pulls[0].cursor).toMatchObject({ after: 'page-1' });
  });

  it('does not pull when aborted before it starts', async () => {
    const controller = new AbortController();
    controller.abort();
    provider.tasks.script({ tasks: [issue()] });

    const result = await engine.runSource(sourceId, { signal: controller.signal });

    expect(result).toMatchObject({ outcome: 'aborted', pages: 0 });
    expect(provider.tasks.pulls).toHaveLength(0);
  });

  it('skips a second run for a source while one is in flight', async () => {
    provider.tasks.script({ tasks: [issue()], delayMs: 20 });

    const [first, second] = await Promise.all([
      engine.runSource(sourceId),
      engine.runSource(sourceId),
    ]);

    expect(first).toMatchObject({ outcome: 'completed' });
    expect(second).toMatchObject({ outcome: 'skipped', skipReason: 'already_running' });
    expect(provider.tasks.pulls).toHaveLength(1);
  });
});

describe('SyncEngine — logging and change events', () => {
  it('logs one line per run with counts and no titles, descriptions or credentials', async () => {
    provider.tasks.script(
      { tasks: [issue({ title: 'Secret title', description: 'Secret body' })], done: false },
      { tasks: [issue()], skipped: 1 },
    );

    await engine.runSource(sourceId);

    expect(logger.info).toHaveBeenCalledTimes(1);
    const [line] = logLines();
    expect(line).toMatch(
      new RegExp(
        `^Sync run source=${sourceId} mode=initial pages=2 inserted=2 updated=0 removed=0 ` +
          `skipped=1 durationMs=\\d+ outcome=completed$`,
      ),
    );
    expect(line).not.toMatch(/Secret|fake_api_key/);
  });

  it('logs a failed run as a warning, by error class only', async () => {
    provider.tasks.script({
      error: new ProviderUnavailableError('Issue "Secret title" timed out'),
    });

    await engine.runSource(sourceId);

    expect(logger.warn).toHaveBeenCalledTimes(1);
    const [line] = logLines();
    expect(line).toMatch(/outcome=failed error=ProviderUnavailableError$/);
    expect(line).not.toMatch(/Secret/);
  });

  it('emits the recorded source status through IntegrationService', async () => {
    provider.tasks.script({ tasks: [issue()] });

    await engine.runSource(sourceId);

    expect(changes).toEqual([
      {
        type: 'sync_status_changed',
        integrationId,
        sourceId,
        source: {
          id: sourceId,
          sourceType: 'tasks',
          enabled: true,
          initialSyncCompleted: true,
          lastSyncedAt: NOW,
          lastError: null,
          retryAt: null,
        },
      },
    ]);
  });
});
