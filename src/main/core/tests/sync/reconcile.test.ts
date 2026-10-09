import { describe, it, expect, beforeEach, afterEach, vi, Mock } from 'vitest';
import { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { and, eq } from 'drizzle-orm';
import { ExternalSourceId, ProjectId, TaskId } from '@common/ids';
import { externalLinks, externalSources } from '@main/db/schema/integrations';
import { tasks as tasksTable } from '@main/db/schema/tasks';
import { projects as projectsTable } from '@main/db/schema/projects';
import { createDb } from '../utils';
import { FakeCipher } from '../__mocks__/fake-cipher';
import { createFakeProvider, FakeLookup, FakeProvider, fakeRegistry } from './fake-provider';
import { SyncEngine } from '../../sync/engine';
import { SyncWriter } from '../../sync/writer';
import { SyncMode, SyncProgress, SyncRunOutcome, SyncSkipReason } from '../../sync/types';
import { CLOSED_ISSUE_WINDOW_MS } from '../../sync/constants';
import { SearchService } from '../../search/service';
import { CredentialStore } from '../../integrations/credential-store';
import { IntegrationService } from '../../integrations/service';
import { LookupResult } from '../../integrations/providers/provider';
import {
  ExternalProject,
  ExternalTask,
  LinkState,
  Provider as ProviderId,
} from '../../integrations/types';
import { TaskService } from '../../tasks/service';
import { ProjectService } from '../../projects/service';
import { TaskPriority, TaskStatus } from '../../tasks/types';
import { ProjectStatus } from '../../projects/types';
import { ProviderUnavailableError } from '../../shared/errors';

const DAY = 24 * 60 * 60 * 1000;
const CREATED = new Date('2026-01-15T09:00:00Z');
const V1 = new Date('2026-10-01T12:00:00Z');
const V2 = new Date('2026-10-02T12:00:00Z');
const NOW = new Date('2026-10-09T12:00:00Z');
const PAST_WINDOW = new Date(NOW.getTime() - CLOSED_ISSUE_WINDOW_MS - DAY);
const WITHIN_WINDOW = new Date(NOW.getTime() - 10 * DAY);

let db: BetterSQLite3Database;
let workspacePath: string;
let provider: FakeProvider;
let service: IntegrationService;
let engine: SyncEngine;
type LogFn = (...params: unknown[]) => void;
let logger: { info: Mock<LogFn>; warn: Mock<LogFn>; error: Mock<LogFn> };
let progress: SyncProgress[];
let sourceId: ExternalSourceId;
let itemCount = 0;

// what Linear holds now: the lookup answers from these, and reports anything else as gone
let remoteTasks: Map<string, ExternalTask>;
let remoteProjects: Map<string, ExternalProject>;

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

// answers a lookup from the remote maps, as Linear would
function lookupFromRemote({ externalIds, projectIds }: FakeLookup): Partial<LookupResult> {
  const found = externalIds.flatMap((id) => remoteTasks.get(id) ?? []);
  const projects = new Map<string, ExternalProject>();
  for (const task of found) {
    const proj = task.projectExternalId ? remoteProjects.get(task.projectExternalId) : undefined;
    if (proj) projects.set(proj.externalId, proj);
  }
  projectIds
    .flatMap((id) => remoteProjects.get(id) ?? [])
    .forEach((proj) => {
      projects.set(proj.externalId, proj);
    });
  return {
    tasks: found,
    projects: [...projects.values()],
    gone: externalIds.filter((id) => !remoteTasks.has(id)),
    goneProjects: projectIds.filter((id) => !remoteProjects.has(id)),
  };
}

// mirrors these through an initial sync, and records them as Linear's current state
async function seed(tasks: ExternalTask[], projects: ExternalProject[] = []) {
  tasks.forEach((task) => remoteTasks.set(task.externalId, task));
  projects.forEach((proj) => remoteProjects.set(proj.externalId, proj));
  provider.tasks.script({ tasks, projects });
  const result = await engine.runSource(sourceId);
  expect(result.outcome).toBe(SyncRunOutcome.COMPLETED);
}

// the snapshot: every remote issue still open and assigned to the viewer
function assignNow() {
  provider.tasks.assigned = [...remoteTasks.values()]
    .filter(
      (task) =>
        task.assignedToViewer &&
        task.status !== TaskStatus.COMPLETED &&
        task.status !== TaskStatus.CANCELLED,
    )
    .map((task) => task.externalId);
}

async function reconcile() {
  assignNow();
  return engine.reconcileSource(sourceId);
}

function linkOf(externalId: string) {
  return db
    .select()
    .from(externalLinks)
    .where(and(eq(externalLinks.sourceId, sourceId), eq(externalLinks.externalId, externalId)))
    .get()!;
}

function taskOf(externalId: string) {
  const taskId = linkOf(externalId).taskId!;
  return db.select().from(tasksTable).where(eq(tasksTable.id, taskId)).get()!;
}

function projectOf(externalId: string) {
  const projectId = linkOf(externalId).projectId!;
  return db.select().from(projectsTable).where(eq(projectsTable.id, projectId)).get()!;
}

function sourceRow() {
  return db.select().from(externalSources).where(eq(externalSources.id, sourceId)).get()!;
}

function setLinkState(externalId: string, state: LinkState) {
  db.update(externalLinks).set({ state }).where(eq(externalLinks.externalId, externalId)).run();
}

async function localTaskIn(projectId: ProjectId): Promise<TaskId> {
  const task = await new TaskService(db).createTask({ title: 'Mine', dueDate: NOW, projectId });
  return task.id;
}

beforeEach(async () => {
  workspacePath = await fs.mkdtemp(path.join(os.tmpdir(), 'devbrain-sync-reconcile-'));
  db = createDb();
  provider = createFakeProvider();
  const credentials = new CredentialStore(db, { cipher: new FakeCipher() });
  service = new IntegrationService(db, { credentials, providers: fakeRegistry(provider) });
  logger = { info: vi.fn<LogFn>(), warn: vi.fn<LogFn>(), error: vi.fn<LogFn>() };
  engine = new SyncEngine(db, {
    integrations: service,
    credentials,
    providers: fakeRegistry(provider),
    writer: new SyncWriter(db, new SearchService(db, workspacePath)),
    logger,
    now: () => NOW,
  });
  const integration = await service.connectWithApiKey(ProviderId.LINEAR, 'fake_api_key');
  sourceId = integration.sources[0].id;
  progress = [];
  engine.onProgress((event) => progress.push(event));
  remoteTasks = new Map();
  remoteProjects = new Map();
  provider.tasks.respondToLookup = lookupFromRemote;
});

afterEach(async () => {
  await fs.rm(workspacePath, { recursive: true, force: true });
});

describe('SyncEngine reconcile — removals', () => {
  it('removes a reassigned issue: archived, link removed', async () => {
    const kept = issue();
    const reassigned = issue();
    await seed([kept, reassigned]);
    remoteTasks.set(reassigned.externalId, { ...reassigned, assignedToViewer: false });

    const result = await reconcile();

    expect(result).toMatchObject({
      outcome: SyncRunOutcome.COMPLETED,
      mode: SyncMode.RECONCILE,
      pages: 1,
      removed: 1,
    });
    expect(provider.tasks.lookups.map((lookup) => lookup.externalIds)).toEqual([
      [reassigned.externalId],
    ]);
    expect(taskOf(reassigned.externalId).archivedAt).toBeInstanceOf(Date);
    expect(linkOf(reassigned.externalId)).toMatchObject({ state: LinkState.REMOVED });
    expect(taskOf(kept.externalId).archivedAt).toBeNull();
    expect(sourceRow().lastReconciledAt).toEqual(NOW);
  });

  it('removes a deleted issue that no longer resolves', async () => {
    const deleted = issue();
    await seed([deleted]);
    remoteTasks.delete(deleted.externalId);

    const result = await reconcile();

    expect(result).toMatchObject({ outcome: SyncRunOutcome.COMPLETED, removed: 1 });
    expect(taskOf(deleted.externalId).archivedAt).toBeInstanceOf(Date);
    expect(linkOf(deleted.externalId).state).toBe(LinkState.REMOVED);
  });

  it('updates an issue completed in Linear between incremental runs, without removing it', async () => {
    const done = issue();
    await seed([done]);
    remoteTasks.set(done.externalId, {
      ...done,
      status: TaskStatus.COMPLETED,
      completedAt: V2,
      updatedAt: V2,
    });

    const result = await reconcile();

    expect(result).toMatchObject({ updated: 1, removed: 0 });
    expect(taskOf(done.externalId)).toMatchObject({
      status: TaskStatus.COMPLETED,
      completedAt: V2,
      archivedAt: null,
    });
    expect(linkOf(done.externalId).state).toBe(LinkState.SYNCED);
  });

  it('never looks up a detached task, even when it is missing from the snapshot', async () => {
    const detached = issue();
    await seed([detached]);
    setLinkState(detached.externalId, LinkState.DETACHED);
    remoteTasks.delete(detached.externalId);

    await reconcile();

    expect(provider.tasks.lookups).toEqual([]);
    expect(taskOf(detached.externalId).archivedAt).toBeNull();
    expect(linkOf(detached.externalId).state).toBe(LinkState.DETACHED);
  });
});

describe('SyncEngine reconcile — returning issues', () => {
  it('restores an issue restored from the trash with updatedAt unchanged', async () => {
    const trashed = issue({ title: 'Back again' });
    await seed([trashed]);
    // trashing comes through the incremental pull as a removal
    provider.tasks.script({ removedIds: [trashed.externalId] });
    await engine.runSource(sourceId);
    expect(linkOf(trashed.externalId).state).toBe(LinkState.REMOVED);

    // restored: back in the snapshot, with the same updatedAt, so no pull would see it
    const result = await reconcile();

    expect(provider.tasks.lookups.map((lookup) => lookup.externalIds)).toEqual([
      [trashed.externalId],
    ]);
    expect(result).toMatchObject({ updated: 1, removed: 0 });
    expect(linkOf(trashed.externalId)).toMatchObject({ state: LinkState.SYNCED, removedAt: null });
    expect(taskOf(trashed.externalId)).toMatchObject({ title: 'Back again', archivedAt: null });
  });

  it('never treats a detached task in the snapshot as returning', async () => {
    const detached = issue();
    await seed([detached]);
    setLinkState(detached.externalId, LinkState.DETACHED);

    await reconcile();

    expect(provider.tasks.lookups).toEqual([]);
  });

  it('makes no lookup with no candidates and no returning issues', async () => {
    const proj = project();
    await seed([issue({ projectExternalId: proj.externalId }), issue()], [proj]);

    const result = await reconcile();

    expect(provider.tasks.lookups).toEqual([]);
    expect(result).toMatchObject({
      outcome: SyncRunOutcome.COMPLETED,
      inserted: 0,
      updated: 0,
      removed: 0,
    });
    expect(sourceRow().lastReconciledAt).toEqual(NOW);
  });

  it('sends the source’s synced projects with the lookup', async () => {
    const proj = project();
    const gone = issue({ projectExternalId: proj.externalId });
    await seed([gone, issue({ projectExternalId: proj.externalId })], [proj]);
    remoteTasks.delete(gone.externalId);

    await reconcile();

    expect(provider.tasks.lookups).toEqual([
      { externalIds: [gone.externalId], projectIds: [proj.externalId] },
    ]);
  });
});

describe('SyncEngine reconcile — settling', () => {
  it('settles issues closed before the window, and no longer watches them', async () => {
    const oldDone = issue({
      status: TaskStatus.COMPLETED,
      completedAt: PAST_WINDOW,
      updatedAt: PAST_WINDOW,
    });
    const oldCancelled = issue({ status: TaskStatus.CANCELLED, updatedAt: PAST_WINDOW });
    const recentDone = issue({
      status: TaskStatus.COMPLETED,
      completedAt: WITHIN_WINDOW,
      updatedAt: WITHIN_WINDOW,
    });
    const recentCancelled = issue({ status: TaskStatus.CANCELLED, updatedAt: WITHIN_WINDOW });
    const open = issue();
    await seed([oldDone, oldCancelled, recentDone, recentCancelled, open]);

    await reconcile();

    expect(linkOf(oldDone.externalId).settledAt).toBeInstanceOf(Date);
    expect(linkOf(oldCancelled.externalId).settledAt).toBeInstanceOf(Date);
    expect(linkOf(recentDone.externalId).settledAt).toBeNull();
    expect(linkOf(recentCancelled.externalId).settledAt).toBeNull();
    expect(linkOf(open.externalId).settledAt).toBeNull();
    // the closed issues are not in the open-issue snapshot, and are not candidates either
    expect(provider.tasks.lookups).toEqual([]);

    // a settled issue gone from Linear is not noticed: it is no longer checked
    remoteTasks.delete(oldDone.externalId);
    await reconcile();
    expect(provider.tasks.lookups).toEqual([]);
    expect(linkOf(oldDone.externalId).state).toBe(LinkState.SYNCED);
  });

  it('clears settledAt when an incremental pull reopens a settled issue', async () => {
    const settled = issue({
      status: TaskStatus.COMPLETED,
      completedAt: PAST_WINDOW,
      updatedAt: PAST_WINDOW,
    });
    await seed([settled]);
    await reconcile();
    expect(linkOf(settled.externalId).settledAt).toBeInstanceOf(Date);

    const reopened = {
      ...settled,
      status: TaskStatus.IN_PROGRESS,
      completedAt: null,
      updatedAt: V2,
    };
    provider.tasks.script({ tasks: [reopened] });
    await engine.runSource(sourceId);

    expect(linkOf(settled.externalId).settledAt).toBeNull();
    expect(taskOf(settled.externalId)).toMatchObject({
      status: TaskStatus.IN_PROGRESS,
      completedAt: null,
    });

    // watched again: reassigned away, the next reconcile removes it
    remoteTasks.set(settled.externalId, { ...reopened, assignedToViewer: false });
    await reconcile();
    expect(linkOf(settled.externalId).state).toBe(LinkState.REMOVED);
  });
});

describe('SyncEngine reconcile — project lifecycle', () => {
  it('detaches a project left with only a local task, and archives one left empty', async () => {
    const withLocal = project();
    const empty = project();
    const a = issue({ projectExternalId: withLocal.externalId });
    const b = issue({ projectExternalId: empty.externalId });
    await seed([a, b], [withLocal, empty]);
    const withLocalId = linkOf(withLocal.externalId).projectId!;
    const local = await localTaskIn(withLocalId);
    remoteTasks.set(a.externalId, { ...a, assignedToViewer: false });
    remoteTasks.delete(b.externalId);

    const result = await reconcile();

    // two tasks and one project left scope
    expect(result).toMatchObject({ removed: 3 });
    expect(result.changed.sort()).toEqual(['project', 'task']);

    expect(linkOf(withLocal.externalId).state).toBe(LinkState.DETACHED);
    expect(projectOf(withLocal.externalId).archivedAt).toBeNull();
    // a normal local project now: editable, and the local task keeps its home
    const projects = new ProjectService(db);
    await projects.updateProject(withLocalId, { title: 'Mine now' });
    expect((await projects.getById(withLocalId)).title).toBe('Mine now');
    expect((await new TaskService(db).getById(local)).projectId).toBe(withLocalId);

    expect(linkOf(empty.externalId)).toMatchObject({ state: LinkState.REMOVED });
    expect(linkOf(empty.externalId).removedAt).toEqual(expect.any(Date));
    expect(projectOf(empty.externalId).archivedAt).toBeInstanceOf(Date);
  });

  it('keeps a project whose issues moved but that still has a synced task', async () => {
    const proj = project();
    const leaving = issue({ projectExternalId: proj.externalId });
    const staying = issue({ projectExternalId: proj.externalId });
    await seed([leaving, staying], [proj]);
    remoteTasks.delete(leaving.externalId);

    await reconcile();

    expect(linkOf(proj.externalId).state).toBe(LinkState.SYNCED);
    expect(projectOf(proj.externalId).archivedAt).toBeNull();
  });

  it('archives a project emptied by an incremental pull, on a pass with no lookup', async () => {
    const proj = project();
    const trashed = issue({ projectExternalId: proj.externalId });
    await seed([trashed], [proj]);
    // trashing comes through the incremental pull, which leaves the project in place
    provider.tasks.script({ removedIds: [trashed.externalId] });
    await engine.runSource(sourceId);
    remoteTasks.delete(trashed.externalId);
    expect(linkOf(proj.externalId).state).toBe(LinkState.SYNCED);

    const result = await reconcile();

    expect(provider.tasks.lookups).toEqual([]);
    expect(result).toMatchObject({ removed: 1, changed: ['project'] });
    expect(linkOf(proj.externalId).state).toBe(LinkState.REMOVED);
    expect(projectOf(proj.externalId).archivedAt).toBeInstanceOf(Date);
  });

  it('counts a detached task as a reason to keep a project', async () => {
    const proj = project();
    const detached = issue({ projectExternalId: proj.externalId });
    const leaving = issue({ projectExternalId: proj.externalId });
    await seed([detached, leaving], [proj]);
    setLinkState(detached.externalId, LinkState.DETACHED);
    remoteTasks.delete(leaving.externalId);

    await reconcile();

    expect(linkOf(proj.externalId).state).toBe(LinkState.DETACHED);
    expect(taskOf(detached.externalId).projectId).toBe(linkOf(proj.externalId).projectId);
  });

  it('archives a project deleted in Linear, and its synced issues lose it', async () => {
    const deleted = project();
    const other = project();
    const inDeleted = issue({ projectExternalId: deleted.externalId });
    const candidate = issue({ projectExternalId: other.externalId });
    const keepsOther = issue({ projectExternalId: other.externalId });
    await seed([inDeleted, candidate, keepsOther], [deleted, other]);
    remoteProjects.delete(deleted.externalId);
    // the deleted project is noticed by the lookup a candidate triggers
    remoteTasks.delete(candidate.externalId);

    await reconcile();

    expect(provider.tasks.lookups[0].projectIds.sort()).toEqual(
      [deleted.externalId, other.externalId].sort(),
    );
    expect(linkOf(deleted.externalId).state).toBe(LinkState.REMOVED);
    expect(projectOf(deleted.externalId).archivedAt).toBeInstanceOf(Date);
    expect(taskOf(inDeleted.externalId)).toMatchObject({ projectId: null, archivedAt: null });
    expect(linkOf(other.externalId).state).toBe(LinkState.SYNCED);
  });

  it('detaches a deleted project that holds a local task', async () => {
    const deleted = project();
    const inDeleted = issue({ projectExternalId: deleted.externalId });
    const candidate = issue();
    await seed([inDeleted, candidate], [deleted]);
    const deletedId = linkOf(deleted.externalId).projectId!;
    const local = await localTaskIn(deletedId);
    remoteProjects.delete(deleted.externalId);
    remoteTasks.delete(candidate.externalId);

    await reconcile();

    expect(linkOf(deleted.externalId).state).toBe(LinkState.DETACHED);
    // a synced task cannot live in a local project; the local one stays
    expect(taskOf(inDeleted.externalId).projectId).toBeNull();
    expect((await new TaskService(db).getById(local)).projectId).toBe(deletedId);
  });

  it('reattaches a detached project when its Linear project returns, with no duplicate', async () => {
    const proj = project({ title: 'Platform' });
    const leaving = issue({ projectExternalId: proj.externalId });
    await seed([leaving], [proj]);
    const projectId = linkOf(proj.externalId).projectId!;
    const local = await localTaskIn(projectId);
    remoteTasks.delete(leaving.externalId);
    await reconcile();
    expect(linkOf(proj.externalId).state).toBe(LinkState.DETACHED);

    // a new issue in the same Linear project arrives through the incremental pull
    const arriving = issue({ projectExternalId: proj.externalId });
    const renamed = { ...proj, title: 'Platform v2', updatedAt: V2 };
    provider.tasks.script({ tasks: [arriving], projects: [renamed] });
    await engine.runSource(sourceId);

    expect(db.select().from(projectsTable).all()).toHaveLength(1);
    expect(linkOf(proj.externalId).state).toBe(LinkState.SYNCED);
    expect(projectOf(proj.externalId).title).toBe('Platform v2');
    expect(taskOf(arriving.externalId).projectId).toBe(projectId);
    expect((await new TaskService(db).getById(local)).projectId).toBe(projectId);

    // and it stays: the next reconcile finds a synced task in it
    remoteTasks.set(arriving.externalId, arriving);
    await reconcile();
    expect(linkOf(proj.externalId).state).toBe(LinkState.SYNCED);
  });
});

describe('SyncEngine reconcile — runs', () => {
  it('waits for the initial sync to finish', async () => {
    provider.tasks.assigned = ['issue-x'];

    const result = await engine.reconcileSource(sourceId);

    expect(result).toMatchObject({
      outcome: SyncRunOutcome.SKIPPED,
      skipReason: SyncSkipReason.INITIAL_SYNC_PENDING,
    });
    expect(provider.tasks.lookups).toEqual([]);
    expect(sourceRow().lastReconciledAt).toBeNull();
  });

  it('records a failure, and sets lastReconciledAt only on success', async () => {
    await seed([issue()]);
    provider.tasks.assigned = { error: new ProviderUnavailableError('down') };

    const result = await engine.reconcileSource(sourceId);

    expect(result).toMatchObject({ outcome: SyncRunOutcome.FAILED, mode: SyncMode.RECONCILE });
    expect(sourceRow()).toMatchObject({
      lastError: expect.any(String),
      consecutiveFailures: 1,
      lastReconciledAt: null,
    });

    await reconcile();
    expect(sourceRow()).toMatchObject({
      lastError: null,
      consecutiveFailures: 0,
      lastReconciledAt: NOW,
    });
  });

  it('writes nothing when aborted during the lookup', async () => {
    const gone = issue();
    await seed([gone]);
    remoteTasks.delete(gone.externalId);
    const controller = new AbortController();
    provider.tasks.respondToLookup = (request) => {
      controller.abort();
      return lookupFromRemote(request);
    };
    assignNow();

    const result = await engine.reconcileSource(sourceId, { signal: controller.signal });

    expect(result.outcome).toBe(SyncRunOutcome.ABORTED);
    expect(linkOf(gone.externalId).state).toBe(LinkState.SYNCED);
    expect(sourceRow().lastReconciledAt).toBeNull();
  });

  it('reports one page with phase reconcile, and logs the run', async () => {
    const gone = issue();
    await seed([gone]);
    progress = [];
    remoteTasks.delete(gone.externalId);

    await reconcile();

    expect(progress).toEqual([
      {
        sourceId,
        phase: SyncMode.RECONCILE,
        pages: 1,
        summary: { inserted: 0, updated: 0, removed: 1, changed: ['task'] },
        itemsApplied: 1,
      },
    ]);
    const lines = logger.info.mock.calls.map((call) => String(call[0]));
    expect(lines.at(-1)).toMatch(/mode=reconcile .*removed=1 .*outcome=completed/);
  });
});
