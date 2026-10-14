import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import type Database from 'better-sqlite3';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { eq, sql } from 'drizzle-orm';
import { EventId, ExternalSourceId, IntegrationId, ProjectId, TaskId } from '@common/ids';
import { externalLinks, externalSources, integrations } from '@main/db/schema/integrations';
import { tasks as tasksTable } from '@main/db/schema/tasks';
import { projects as projectsTable } from '@main/db/schema/projects';
import { events as eventsTable } from '@main/db/schema/events';
import { calendars as calendarsTable } from '@main/db/schema/calendars';
import { createDb } from '../utils';
import { FakeCipher } from '../__mocks__/fake-cipher';
import {
  createFakeCalendarProvider,
  createFakeProvider,
  FakeCalendarProvider,
  FakeProvider,
  fakeRegistry,
  FAKE_ACCESS_TOKEN,
  FAKE_ACCOUNT,
  FAKE_API_KEY,
  FAKE_REFRESH_TOKEN,
} from '../sync/fake-provider';
import { SyncEngine } from '../../sync/engine';
import { SyncStateManager } from '../../sync/sync-state';
import { SyncWriter } from '../../sync/writer';
import { TaskReconciler } from '../../sync/task-reconciler';
import { SyncRunOutcome, SyncSkipReason } from '../../sync/types';
import { CURSOR_OVERLAP_MS, REVOKE_TIMEOUT_MS } from '../../sync/constants';
import { SearchService } from '../../search/service';
import { CredentialStore } from '../../integrations/credential-store';
import { IntegrationChange, IntegrationService } from '../../integrations/service';
import { DetachService } from '../../integrations/detach';
import { OAuthClient } from '../../integrations/oauth/types';
import {
  AuthType,
  ExternalEvent,
  ExternalProject,
  ExternalTask,
  IntegrationStatus,
  LinkState,
  Provider as ProviderId,
} from '../../integrations/types';
import { TaskService } from '../../tasks/service';
import { ProjectService } from '../../projects/service';
import { EventService } from '../../events/service';
import { NoteService } from '../../notes/service';
import { TaskPriority, TaskStatus } from '../../tasks/types';
import { ProjectStatus } from '../../projects/types';
import { EventKind, EventStatus } from '../../events/types';
import {
  IntegrationAccountMismatchError,
  NotFoundError,
  ProviderUnavailableError,
} from '../../shared/errors';

const CREATED = new Date('2026-01-15T09:00:00Z');
const V1 = new Date('2026-10-01T12:00:00Z');
const V2 = new Date('2026-10-02T12:00:00Z');
const TOMORROW = new Date(Date.now() + 24 * 60 * 60 * 1000);
const CALENDAR = 'ada@example.com';
const OTHER_CALENDAR = 'team@group.calendar.example.com';

let db: BetterSQLite3Database;
let workspacePath: string;
let linear: FakeProvider;
let google: FakeCalendarProvider;
let oauth: {
  authorize: ReturnType<typeof vi.fn<OAuthClient['authorize']>>;
  refresh: ReturnType<typeof vi.fn<OAuthClient['refresh']>>;
  revoke: ReturnType<typeof vi.fn<OAuthClient['revoke']>>;
};
let credentials: CredentialStore;
let service: IntegrationService;
let engine: SyncEngine;
let detach: DetachService;
let tasks: TaskService;
let projects: ProjectService;
let events: EventService;
let notes: NoteService;
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

function event(overrides: Partial<ExternalEvent> = {}): ExternalEvent {
  itemCount += 1;
  const calendarId = overrides.calendarId ?? CALENDAR;
  return {
    externalId: `${calendarId}:event-${itemCount}`,
    calendarId,
    url: `https://calendar.example.com/event-${itemCount}`,
    title: `Event ${itemCount}`,
    description: null,
    startAt: new Date('2026-10-20T10:00:00Z'),
    endAt: new Date('2026-10-20T11:00:00Z'),
    allDay: false,
    startDate: null,
    endDate: null,
    timeZone: 'UTC',
    location: null,
    recurrenceRule: null,
    recurringEventExternalId: null,
    originalStartAt: null,
    meetingUrl: null,
    color: null,
    status: EventStatus.CONFIRMED,
    response: null,
    kind: EventKind.DEFAULT,
    cancelled: false,
    createdAt: CREATED,
    updatedAt: V1,
    ...overrides,
  };
}

async function connectLinear(): Promise<{ id: IntegrationId; sourceId: ExternalSourceId }> {
  const integration = await service.connectWithApiKey(ProviderId.LINEAR, FAKE_API_KEY);
  return { id: integration.id, sourceId: integration.sources[0].id };
}

async function connectCalendar(): Promise<{ id: IntegrationId; sourceId: ExternalSourceId }> {
  const integration = await service.connectWithOAuth(ProviderId.GOOGLE_CALENDAR);
  return { id: integration.id, sourceId: integration.sources[0].id };
}

// mirrors the issues and projects by running the engine against the fake provider
async function syncTasks(
  sourceId: ExternalSourceId,
  items: ExternalTask[],
  projectItems: ExternalProject[] = [],
  removedIds: string[] = [],
) {
  linear.tasks.script({ tasks: items, projects: projectItems, removedIds });
  const result = await engine.runSource(sourceId);
  expect(result.outcome).toBe(SyncRunOutcome.COMPLETED);
}

// mirrors the events of the primary calendar
async function syncEvents(sourceId: ExternalSourceId, items: ExternalEvent[]) {
  google.calendars.events.set(CALENDAR, items);
  const result = await engine.runSource(sourceId);
  expect(result.outcome).toBe(SyncRunOutcome.COMPLETED);
}

// an item's link by its provider id, whatever its source, now null after a disconnect
function linkOf(item: { externalId: string }) {
  return db.select().from(externalLinks).where(eq(externalLinks.externalId, item.externalId)).get();
}

function taskIdOf(item: ExternalTask): TaskId {
  return linkOf(item)!.taskId!;
}

function projectIdOf(item: ExternalProject): ProjectId {
  return linkOf(item)!.projectId!;
}

function eventIdOf(item: ExternalEvent): EventId {
  return linkOf(item)!.eventId!;
}

function taskRow(id: TaskId) {
  return db.select().from(tasksTable).where(eq(tasksTable.id, id)).get();
}

function projectRow(id: ProjectId) {
  return db.select().from(projectsTable).where(eq(projectsTable.id, id)).get();
}

function eventRow(id: EventId) {
  return db.select().from(eventsTable).where(eq(eventsTable.id, id)).get();
}

// whether the database connection is inside a transaction now; createDb's type leaves out $client
function inTransaction(): boolean {
  return (db as typeof db & { $client: Database.Database }).$client.inTransaction;
}

function indexed(): string[] {
  return db
    .all<{ entityId: string }>(sql`SELECT entity_id AS entityId FROM search_index`)
    .map((row) => row.entityId);
}

// every row a disconnect could touch, to show that something changed nothing
function snapshot() {
  return {
    integrations: db.select().from(integrations).all(),
    sources: db.select().from(externalSources).all(),
    links: db.select().from(externalLinks).all(),
    tasks: db.select().from(tasksTable).all(),
    projects: db.select().from(projectsTable).all(),
    events: db.select().from(eventsTable).all(),
    calendars: db.select().from(calendarsTable).all(),
  };
}

beforeEach(async () => {
  workspacePath = await fs.mkdtemp(path.join(os.tmpdir(), 'devbrain-disconnect-'));
  await fs.mkdir(path.join(workspacePath, 'notes'), { recursive: true });
  db = createDb();
  linear = createFakeProvider();
  google = createFakeCalendarProvider();
  oauth = {
    // hands out a token that never expires, without a browser
    authorize: vi.fn<OAuthClient['authorize']>(async (config) => ({
      accessToken: FAKE_ACCESS_TOKEN,
      refreshToken: FAKE_REFRESH_TOKEN,
      expiresAt: null,
      scopes: config.scopes,
    })),
    refresh: vi.fn<OAuthClient['refresh']>(async () => {
      throw new Error('not refreshed in these tests');
    }),
    revoke: vi.fn<OAuthClient['revoke']>(async () => {}),
  };
  const providers = fakeRegistry(linear, google);
  credentials = new CredentialStore(db, { cipher: new FakeCipher() });
  const search = new SearchService(db, workspacePath);
  service = new IntegrationService(db, { credentials, providers, oauth });
  // as Workspace does: deleted items leave search in the disconnect's own transaction
  service.onChange((change) => {
    if (change.type !== 'disconnected') return;
    const { taskIds, projectIds, eventIds } = change.deleted;
    search.removeFromIndex([...taskIds, ...projectIds, ...eventIds]);
  });
  const writer = new SyncWriter(db, search);
  const logger = { info: vi.fn(), warn: vi.fn(), error: vi.fn() };
  const syncState = new SyncStateManager(db);
  engine = new SyncEngine(db, {
    integrations: service,
    syncState,
    credentials,
    providers,
    writer,
    logger,
  });
  detach = new DetachService(
    db,
    new TaskReconciler({ db, syncState, credentials, providers, writer, logger }),
  );
  tasks = new TaskService(db);
  projects = new ProjectService(db);
  events = new EventService(db);
  notes = new NoteService(db, workspacePath);
});

afterEach(async () => {
  vi.restoreAllMocks();
  await fs.rm(workspacePath, { recursive: true, force: true });
});

describe('IntegrationService — disable and enable', () => {
  const since = new Date(V2.getTime() - CURSOR_OVERLAP_MS).toISOString();

  it('disabling a source freezes its mirrored rows; enabling it resumes from the saved cursor', async () => {
    const { sourceId } = await connectLinear();
    await syncTasks(sourceId, [issue({ updatedAt: V2 })], [project()]);
    const before = snapshot();

    await service.setSourceEnabled(sourceId, false);
    const skipped = await engine.runSource(sourceId);

    expect(skipped).toMatchObject({
      outcome: SyncRunOutcome.SKIPPED,
      skipReason: SyncSkipReason.SOURCE_DISABLED,
    });
    const frozen = snapshot();
    expect({ ...frozen, sources: [] }).toEqual({ ...before, sources: [] });
    expect(frozen.sources[0].cursor).toEqual(before.sources[0].cursor);

    await service.setSourceEnabled(sourceId, true);
    await syncTasks(sourceId, []);

    expect(linear.tasks.pulls).toHaveLength(2);
    expect(linear.tasks.pulls[1].query).toEqual({ changedSince: since });
    expect(snapshot().tasks).toEqual(before.tasks);
  });

  it('disabling the integration freezes every source; enabling it resumes from the saved cursors', async () => {
    const { id, sourceId } = await connectLinear();
    const item = issue({ updatedAt: V2 });
    await syncTasks(sourceId, [item]);
    const before = snapshot();

    await service.setEnabled(id, false);
    const skipped = await engine.runSource(sourceId);

    expect(skipped.outcome).toBe(SyncRunOutcome.SKIPPED);
    expect(snapshot().tasks).toEqual(before.tasks);
    expect(snapshot().links).toEqual(before.links);
    expect(linkOf(item)!.state).toBe(LinkState.SYNCED);

    await service.setEnabled(id, true);
    await syncTasks(sourceId, [{ ...item, title: 'Caught up', updatedAt: V2 }]);

    expect(linear.tasks.pulls[1].query).toEqual({ changedSince: since });
  });

  it('an integration with every source off stays connected and syncs nothing', async () => {
    const integration = await service.connectWithApiKey(ProviderId.LINEAR, FAKE_API_KEY, {
      enable: [],
    });

    const result = await engine.runSource(integration.sources[0].id);

    expect(integration.status).toBe(IntegrationStatus.CONNECTED);
    expect(result.skipReason).toBe(SyncSkipReason.SOURCE_DISABLED);
    expect(linear.tasks.pulls).toHaveLength(0);
  });
});

describe('IntegrationService — disconnect, removing synced items', () => {
  it('deletes unlinked tasks; a task with a note is detached and editable', async () => {
    const { id, sourceId } = await connectLinear();
    const plain = issue();
    const noted = issue();
    await syncTasks(sourceId, [plain, noted]);
    const plainId = taskIdOf(plain);
    const notedId = taskIdOf(noted);
    await notes.createNote({ title: 'Notes', linkedTaskId: notedId });
    expect(indexed()).toContain(plainId);

    const result = await service.disconnect(id, { keepLocalCopies: false });

    expect(result).toEqual({
      deleted: { tasks: 1, projects: 0, events: 0 },
      kept: { tasks: 1, projects: 0, events: 0 },
      changed: ['task'],
      revoked: false,
    });
    expect(taskRow(plainId)).toBeUndefined();
    expect(linkOf(plain)).toBeUndefined();
    expect(indexed()).not.toContain(plainId);

    const kept = await tasks.getById(notedId);
    expect(kept.external).toMatchObject({
      provider: ProviderId.LINEAR,
      state: LinkState.DETACHED,
      key: noted.key,
      url: noted.url,
    });
    expect(linkOf(noted)!.sourceId).toBeNull();
    const edited = await tasks.updateTask(notedId, { title: 'Mine' });
    expect(edited?.title).toBe('Mine');
  });

  it('deletes the integration, its sources and its credentials', async () => {
    const { id } = await connectLinear();

    await service.disconnect(id, { keepLocalCopies: false });

    expect(db.select().from(integrations).all()).toEqual([]);
    expect(db.select().from(externalSources).all()).toEqual([]);
    await expect(service.getById(id)).rejects.toThrow(NotFoundError);
    await expect(service.list()).resolves.toEqual([]);
  });

  it('keeps a task the user linked to a note or an event; a kept subtask outlives its parent', async () => {
    const { id, sourceId } = await connectLinear();
    const parent = issue();
    const child = issue({ parentExternalId: parent.externalId });
    const withEvent = issue();
    const withNote = issue();
    await syncTasks(sourceId, [parent, child, withEvent, withNote]);
    expect(taskRow(taskIdOf(child))!.parentTaskId).toBe(taskIdOf(parent));
    await notes.createNote({ title: 'Child notes', linkedTaskId: taskIdOf(child) });
    const meeting = await events.createEvent({
      title: 'Planning',
      startAt: TOMORROW,
      endAt: new Date(TOMORROW.getTime() + 3600_000),
    });
    await tasks.updateLinks(taskIdOf(withEvent), { linkedEventId: meeting.id });
    const source = await notes.createNote({ title: 'Spec' });
    await tasks.updateLinks(taskIdOf(withNote), { linkedNoteId: source.id });
    const childId = taskIdOf(child);
    const parentId = taskIdOf(parent);

    const result = await service.disconnect(id, { keepLocalCopies: false });

    expect(result.deleted.tasks).toBe(1);
    expect(result.kept.tasks).toBe(3);
    expect(taskRow(parentId)).toBeUndefined();
    expect(taskRow(childId)!.parentTaskId).toBeNull();
    expect([child, withEvent, withNote].map((item) => linkOf(item)!.state)).toEqual([
      LinkState.DETACHED,
      LinkState.DETACHED,
      LinkState.DETACHED,
    ]);
  });

  it('a mirrored project holding a local task survives as a local project', async () => {
    const { id, sourceId } = await connectLinear();
    const mirrored = project();
    const empty = project();
    const inMirrored = issue({ projectExternalId: mirrored.externalId });
    const inEmpty = issue({ projectExternalId: empty.externalId });
    await syncTasks(sourceId, [inMirrored, inEmpty], [mirrored, empty]);
    const projectId = projectIdOf(mirrored);
    const emptyId = projectIdOf(empty);
    const local = await tasks.createTask({ title: 'Mine', dueDate: TOMORROW, projectId });

    const result = await service.disconnect(id, { keepLocalCopies: false });

    expect(result.deleted).toEqual({ tasks: 2, projects: 1, events: 0 });
    expect(result.kept).toEqual({ tasks: 0, projects: 1, events: 0 });
    expect(projectRow(emptyId)).toBeUndefined();
    expect(indexed()).not.toContain(emptyId);
    const kept = await projects.getById(projectId);
    expect(kept.external).toMatchObject({ state: LinkState.DETACHED, url: mirrored.url });
    expect((await tasks.getById(local.id)).projectId).toBe(projectId);
    const renamed = await projects.updateProject(projectId, { title: 'Renamed' });
    expect(renamed?.title).toBe('Renamed');
  });

  it('keeps a project with a note filed under it, or a kept task in it', async () => {
    const { id, sourceId } = await connectLinear();
    const filed = project();
    const holding = project();
    const kept = issue({ projectExternalId: holding.externalId });
    await syncTasks(sourceId, [kept], [filed, holding]);
    await notes.createNote({ title: 'Filed', projectId: projectIdOf(filed) });
    await notes.createNote({ title: 'Task note', linkedTaskId: taskIdOf(kept) });

    const result = await service.disconnect(id, { keepLocalCopies: false });

    expect(result.deleted).toEqual({ tasks: 0, projects: 0, events: 0 });
    expect(result.kept).toEqual({ tasks: 1, projects: 2, events: 0 });
    expect(taskRow(taskIdOf(kept))!.projectId).toBe(projectIdOf(holding));
  });

  it('deletes an unlinked event and keeps a linked one, detached, in a local calendar', async () => {
    google.calendars.calendars.push({
      id: OTHER_CALENDAR,
      name: 'Team',
      primary: false,
      color: null,
      timeZone: 'UTC',
    });
    const { id, sourceId } = await connectCalendar();
    const plain = event();
    const noted = event();
    const tasked = event();
    await syncEvents(sourceId, [plain, noted, tasked]);
    const plainId = eventIdOf(plain);
    const notedId = eventIdOf(noted);
    await notes.createNote({ title: 'Meeting notes', linkedEventId: notedId });
    await tasks.createTask({
      title: 'Follow up',
      dueDate: TOMORROW,
      linkedEventId: eventIdOf(tasked),
    });
    const calendarId = eventRow(notedId)!.calendarId;
    expect(indexed()).toContain(plainId);

    const result = await service.disconnect(id, { keepLocalCopies: false });

    expect(result.deleted).toEqual({ tasks: 0, projects: 0, events: 1 });
    expect(result.kept).toEqual({ tasks: 0, projects: 0, events: 2 });
    expect(result.changed).toEqual(expect.arrayContaining(['event', 'calendar']));
    expect(eventRow(plainId)).toBeUndefined();
    expect(indexed()).not.toContain(plainId);
    expect((await events.getById(notedId)).external).toMatchObject({
      provider: ProviderId.GOOGLE_CALENDAR,
      state: LinkState.DETACHED,
    });
    const edited = await events.updateEvent(notedId, { title: 'Mine' });
    expect(edited.title).toBe('Mine');

    // the calendar holding them is local now; the unselected one, which held nothing, is gone
    const calendarRows = db.select().from(calendarsTable).all();
    expect(calendarRows.map((row) => row.externalId).sort()).toEqual([CALENDAR, null]);
    expect(calendarRows.find((row) => row.id === calendarId)!.sourceId).toBeNull();
  });

  it('deletes a removed task with nothing linked; one with a note stays archived and removed', async () => {
    const { id, sourceId } = await connectLinear();
    const gone = issue();
    const noted = issue();
    await syncTasks(sourceId, [gone, noted]);
    await notes.createNote({ title: 'Notes', linkedTaskId: taskIdOf(noted) });
    await syncTasks(sourceId, [], [], [gone.externalId, noted.externalId]);
    const goneId = taskIdOf(gone);
    const notedId = taskIdOf(noted);
    expect(linkOf(noted)!.state).toBe(LinkState.REMOVED);

    const result = await service.disconnect(id, { keepLocalCopies: false });

    expect(result.deleted.tasks).toBe(1);
    expect(result.kept.tasks).toBe(1);
    expect(taskRow(goneId)).toBeUndefined();
    expect(taskRow(notedId)!.archivedAt).not.toBeNull();
    expect(linkOf(noted)).toMatchObject({ state: LinkState.REMOVED, sourceId: null });
  });

  it("leaves detached items and other integrations' rows alone", async () => {
    const tasksSource = await connectLinear();
    const calendar = await connectCalendar();
    const detachedItem = issue();
    const synced = issue();
    await syncTasks(tasksSource.sourceId, [detachedItem, synced]);
    await syncEvents(calendar.sourceId, [event()]);
    await detach.detachTask(taskIdOf(detachedItem));
    const before = snapshot();

    const result = await service.disconnect(tasksSource.id, { keepLocalCopies: false });

    expect(result.deleted.tasks).toBe(1);
    expect(result.kept.tasks).toBe(0);
    expect(taskRow(taskIdOf(detachedItem))).toEqual(
      before.tasks.find((row) => row.id === taskIdOf(detachedItem)),
    );
    const after = snapshot();
    expect(after.events).toEqual(before.events);
    expect(after.calendars).toEqual(before.calendars);
    expect(after.links.filter((link) => link.eventId)).toEqual(
      before.links.filter((link) => link.eventId),
    );
    expect(after.sources).toEqual(
      before.sources.filter((source) => source.integrationId === calendar.id),
    );
  });
});

describe('IntegrationService — disconnect, keeping local copies', () => {
  it('keeps every task and project, all detached, with their badge data', async () => {
    const { id, sourceId } = await connectLinear();
    const mirrored = project();
    const items = [issue({ projectExternalId: mirrored.externalId }), issue(), issue()];
    await syncTasks(sourceId, items, [mirrored]);
    const before = snapshot();

    const result = await service.disconnect(id, { keepLocalCopies: true });

    expect(result.deleted).toEqual({ tasks: 0, projects: 0, events: 0 });
    expect(result.kept).toEqual({ tasks: 3, projects: 1, events: 0 });
    expect(snapshot().tasks).toEqual(before.tasks);
    for (const item of items) {
      const task = await tasks.getById(taskIdOf(item));
      expect(task.external).toEqual({
        provider: ProviderId.LINEAR,
        state: LinkState.DETACHED,
        key: item.key,
        url: item.url,
        statusLabel: item.statusLabel,
        priorityLabel: item.priorityLabel,
        lastSyncedAt: linkOf(item)!.lastSyncedAt,
      });
      expect(linkOf(item)!.sourceId).toBeNull();
    }
    expect((await projects.getById(projectIdOf(mirrored))).external?.state).toBe(
      LinkState.DETACHED,
    );
  });

  it('keeps every event, detached', async () => {
    const { id, sourceId } = await connectCalendar();
    const items = [event(), event()];
    await syncEvents(sourceId, items);

    const result = await service.disconnect(id, { keepLocalCopies: true });

    expect(result.kept.events).toBe(2);
    expect(items.map((item) => linkOf(item)!.state)).toEqual([
      LinkState.DETACHED,
      LinkState.DETACHED,
    ]);
  });
});

describe('IntegrationService — previewDisconnect', () => {
  it('counts what disconnect then deletes and keeps, and writes nothing', async () => {
    const tasksSource = await connectLinear();
    const calendar = await connectCalendar();
    const mirrored = project();
    const lonely = project();
    const noted = issue({ projectExternalId: mirrored.externalId });
    await syncTasks(
      tasksSource.sourceId,
      [noted, issue({ projectExternalId: lonely.externalId }), issue()],
      [mirrored, lonely],
    );
    const linkedEvent = event();
    await syncEvents(calendar.sourceId, [linkedEvent, event(), event()]);
    await notes.createNote({ title: 'Task note', linkedTaskId: taskIdOf(noted) });
    await notes.createNote({ title: 'Event note', linkedEventId: eventIdOf(linkedEvent) });
    const before = snapshot();

    const taskPreview = await service.previewDisconnect(tasksSource.id);
    const eventPreview = await service.previewDisconnect(calendar.id);

    expect(snapshot()).toEqual(before);
    expect(taskPreview).toEqual({
      deleted: { tasks: 2, projects: 1, events: 0 },
      kept: { tasks: 1, projects: 1, events: 0 },
    });
    expect(eventPreview).toEqual({
      deleted: { tasks: 0, projects: 0, events: 2 },
      kept: { tasks: 0, projects: 0, events: 1 },
    });

    const taskResult = await service.disconnect(tasksSource.id, { keepLocalCopies: false });
    const eventResult = await service.disconnect(calendar.id, { keepLocalCopies: false });

    expect(taskResult).toMatchObject(taskPreview);
    expect(eventResult).toMatchObject(eventPreview);
    const after = snapshot();
    expect(after.tasks).toHaveLength(before.tasks.length - 2);
    expect(after.projects).toHaveLength(before.projects.length - 1);
    expect(after.events).toHaveLength(before.events.length - 2);
  });

  it('throws NotFoundError for an unknown integration', async () => {
    await expect(service.previewDisconnect('int_missing' as IntegrationId)).rejects.toThrow(
      NotFoundError,
    );
  });
});

describe('IntegrationService — disconnect, the disconnected change', () => {
  it('is sent once, inside the removal, once the rows are gone', async () => {
    const { id, sourceId } = await connectLinear();
    const item = issue();
    await syncTasks(sourceId, [item]);
    const taskId = taskIdOf(item);
    // what the listener saw: whether it ran inside the transaction, and what was still there
    const seen: unknown[] = [];
    service.onChange((change: IntegrationChange) =>
      seen.push({
        change,
        inTransaction: inTransaction(),
        integrations: db.select().from(integrations).all().length,
        link: linkOf(item)?.state,
      }),
    );

    await service.disconnect(id, { keepLocalCopies: false });

    expect(seen).toEqual([
      {
        change: {
          type: 'disconnected',
          integrationId: id,
          sourceIds: [sourceId],
          deleted: { taskIds: [taskId], projectIds: [], eventIds: [] },
          changed: ['task'],
        },
        // so a listener's database writes, such as search dropping the ids, commit with it
        inTransaction: true,
        integrations: 0,
        link: undefined,
      },
    ]);
    expect(inTransaction()).toBe(false);
  });

  it('a listener that throws does not stop the disconnect', async () => {
    const { id } = await connectLinear();
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    service.onChange(() => {
      throw new Error('listener failed');
    });

    await service.disconnect(id, { keepLocalCopies: false });

    expect(db.select().from(integrations).all()).toEqual([]);
    expect(error).toHaveBeenCalled();
  });
});

describe('IntegrationService — disconnect, revoking credentials', () => {
  it('revokes an OAuth grant at the provider once the rows are gone and sync has stopped', async () => {
    const { id } = await connectCalendar();
    const order: string[] = [];
    service.onChange((change) => void order.push(change.type));
    let integrationsAtRevoke: number | null = null;
    oauth.revoke.mockImplementationOnce(async () => {
      order.push('revoked');
      integrationsAtRevoke = db.select().from(integrations).all().length;
    });

    const result = await service.disconnect(id, { keepLocalCopies: false });

    expect(result.revoked).toBe(true);
    expect(oauth.revoke).toHaveBeenCalledOnce();
    const [config, tokens, opts] = oauth.revoke.mock.calls[0];
    expect(config).toBe(google.oauth);
    expect(tokens).toMatchObject({
      accessToken: FAKE_ACCESS_TOKEN,
      refreshToken: FAKE_REFRESH_TOKEN,
    });
    expect(opts?.signal).toBeInstanceOf(AbortSignal);
    // with the tokens read before the transaction deleted them
    expect(order).toEqual(['disconnected', 'revoked']);
    expect(integrationsAtRevoke).toBe(0);
  });

  it('a revoke that never answers is given up on after the timeout', async () => {
    const { id } = await connectCalendar();
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    try {
      // ignores the signal, so only the timeout ends the wait
      oauth.revoke.mockImplementationOnce(() => new Promise(() => {}));

      const disconnecting = service.disconnect(id, { keepLocalCopies: false });
      await vi.advanceTimersByTimeAsync(REVOKE_TIMEOUT_MS);

      await expect(disconnecting).resolves.toMatchObject({ revoked: false });
      expect(db.select().from(integrations).all()).toEqual([]);
    } finally {
      vi.useRealTimers();
    }
  });

  it('a revocation failure does not block the disconnect', async () => {
    const { id, sourceId } = await connectCalendar();
    const item = event();
    await syncEvents(sourceId, [item]);
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    oauth.revoke.mockRejectedValueOnce(new ProviderUnavailableError('provider is down'));

    const result = await service.disconnect(id, { keepLocalCopies: false });

    expect(result).toMatchObject({ revoked: false, deleted: { events: 1 } });
    expect(db.select().from(integrations).all()).toEqual([]);
    expect(linkOf(item)).toBeUndefined();
    // the error's name only: a message could quote a token
    expect(warn).toHaveBeenCalledWith(expect.any(String), 'ProviderUnavailableError');
  });

  it('disconnects with credentials that can no longer be read, revoking nothing', async () => {
    const { id } = await connectCalendar();
    db.update(integrations)
      .set({ credentials: Buffer.from('not ciphertext') })
      .where(eq(integrations.id, id))
      .run();

    const result = await service.disconnect(id, { keepLocalCopies: false });

    expect(result.revoked).toBe(false);
    expect(oauth.revoke).not.toHaveBeenCalled();
    expect(db.select().from(integrations).all()).toEqual([]);
  });

  it('revokes nothing for an API key', async () => {
    const { id } = await connectLinear();

    const result = await service.disconnect(id, { keepLocalCopies: false });

    expect(result.revoked).toBe(false);
    expect(oauth.revoke).not.toHaveBeenCalled();
  });

  it('throws NotFoundError for an unknown integration, emitting nothing', async () => {
    const changes: IntegrationChange[] = [];
    service.onChange((change) => changes.push(change));

    await expect(
      service.disconnect('int_missing' as IntegrationId, { keepLocalCopies: false }),
    ).rejects.toThrow(NotFoundError);
    expect(changes).toEqual([]);
  });
});

describe('IntegrationService — connecting the same account again', () => {
  it('reconnect after keep: the next sync re-points links by externalId; no duplicates', async () => {
    const first = await connectLinear();
    const mirrored = project();
    const inProject = issue({ projectExternalId: mirrored.externalId });
    const loose = issue();
    await syncTasks(first.sourceId, [inProject, loose], [mirrored]);
    const before = snapshot();
    await service.disconnect(first.id, { keepLocalCopies: true });

    const second = await connectLinear();
    await syncTasks(second.sourceId, [inProject, loose], [mirrored]);

    const after = snapshot();
    expect(after.tasks.map((row) => row.id)).toEqual(before.tasks.map((row) => row.id));
    expect(after.projects.map((row) => row.id)).toEqual(before.projects.map((row) => row.id));
    expect(after.links.map((link) => link.id)).toEqual(before.links.map((link) => link.id));
    expect(after.links.every((link) => link.sourceId === second.sourceId)).toBe(true);
    // the project was detached by the disconnect, so it is reattached as it returns; the tasks
    // stay the user's copies until reattached
    expect(linkOf(mirrored)!.state).toBe(LinkState.SYNCED);
    expect(linkOf(loose)!.state).toBe(LinkState.DETACHED);

    linear.tasks.respondToLookup = ({ externalIds }) => ({
      tasks: externalIds.includes(loose.externalId) ? [{ ...loose, title: 'Fresh' }] : [],
    });
    const reattached = await detach.reattachTask(taskIdOf(loose));
    expect(reattached).toMatchObject({ title: 'Fresh', external: { state: LinkState.SYNCED } });
  });

  it('reconnect after remove: kept copies are matched and deleted items come back once', async () => {
    const first = await connectLinear();
    const noted = issue();
    const plain = issue();
    await syncTasks(first.sourceId, [noted, plain]);
    const notedId = taskIdOf(noted);
    await notes.createNote({ title: 'Notes', linkedTaskId: notedId });
    await service.disconnect(first.id, { keepLocalCopies: false });

    const second = await connectLinear();
    await syncTasks(second.sourceId, [noted, plain]);

    expect(db.select().from(tasksTable).all()).toHaveLength(2);
    expect(db.select().from(externalLinks).all()).toHaveLength(2);
    expect(linkOf(noted)).toMatchObject({ sourceId: second.sourceId, taskId: notedId });
    expect(linkOf(plain)).toMatchObject({ sourceId: second.sourceId, state: LinkState.SYNCED });
  });

  it('a removed task left by a disconnect is restored when it returns', async () => {
    const first = await connectLinear();
    const noted = issue();
    await syncTasks(first.sourceId, [noted]);
    await notes.createNote({ title: 'Notes', linkedTaskId: taskIdOf(noted) });
    await syncTasks(first.sourceId, [], [], [noted.externalId]);
    await service.disconnect(first.id, { keepLocalCopies: true });

    const second = await connectLinear();
    await syncTasks(second.sourceId, [{ ...noted, updatedAt: V2 }]);

    expect(linkOf(noted)).toMatchObject({ sourceId: second.sourceId, state: LinkState.SYNCED });
    expect(taskRow(taskIdOf(noted))!.archivedAt).toBeNull();
    expect(db.select().from(tasksTable).all()).toHaveLength(1);
  });

  it('reconnecting a calendar account matches its calendars and events through OAuth', async () => {
    const first = await connectCalendar();
    const items = [event(), event()];
    await syncEvents(first.sourceId, items);
    const before = snapshot();
    await service.disconnect(first.id, { keepLocalCopies: true });

    const second = await connectCalendar();
    await syncEvents(second.sourceId, items);

    const after = snapshot();
    expect(after.events.map((row) => row.id)).toEqual(before.events.map((row) => row.id));
    expect(after.calendars.map((row) => row.id)).toEqual(before.calendars.map((row) => row.id));
    expect(after.calendars.find((row) => row.externalId === CALENDAR)!.sourceId).toBe(
      second.sourceId,
    );
    expect(after.links.every((link) => link.sourceId === second.sourceId)).toBe(true);
  });

  it("does not match another provider's copies", async () => {
    const first = await connectCalendar();
    const shared = event({ externalId: 'issue-shared' });
    await syncEvents(first.sourceId, [shared]);
    await service.disconnect(first.id, { keepLocalCopies: true });

    const tasksSource = await connectLinear();
    await syncTasks(tasksSource.sourceId, [issue({ externalId: 'issue-shared' })]);

    const links = db.select().from(externalLinks).all();
    expect(links).toHaveLength(2);
    expect(links.find((link) => link.eventId)!.sourceId).toBeNull();
  });
});

describe('IntegrationService — reconnect', () => {
  it('stores a new API key, keeps the sources and cursors, and asks for a sync', async () => {
    const { id, sourceId } = await connectLinear();
    const item = issue({ updatedAt: V2 });
    await syncTasks(sourceId, [item]);
    service.markNeedsReauth(id);
    const sourcesBefore = snapshot().sources;
    linear.getAccount = async (auth) => {
      expect(auth.authorization).toBe('new_api_key');
      return FAKE_ACCOUNT;
    };
    const changes: IntegrationChange[] = [];
    service.onChange((change) => changes.push(change));

    const reconnected = await service.reconnect(id, {
      type: AuthType.API_KEY,
      apiKey: ' new_api_key ',
    });

    expect(reconnected).toMatchObject({ id, status: IntegrationStatus.CONNECTED });
    expect(snapshot().sources).toEqual(sourcesBefore);
    expect(changes).toEqual([
      { type: 'status_changed', integrationId: id, status: IntegrationStatus.CONNECTED },
    ]);
    await expect(credentials.getAuth(id)).resolves.toEqual({ authorization: 'new_api_key' });
    expect(linkOf(item)!.state).toBe(LinkState.SYNCED);
  });

  it('with a different account is rejected and changes nothing', async () => {
    const { id, sourceId } = await connectLinear();
    await syncTasks(sourceId, [issue()]);
    service.markNeedsReauth(id);
    const before = snapshot();
    linear.getAccount = async () => ({
      accountId: 'org-2:user-9',
      label: 'Grace Hopper, Navy',
      userId: 'user-9',
    });
    const changes: IntegrationChange[] = [];
    service.onChange((change) => changes.push(change));

    await expect(
      service.reconnect(id, { type: AuthType.API_KEY, apiKey: 'someone_elses_key' }),
    ).rejects.toThrow(IntegrationAccountMismatchError);

    expect(snapshot()).toEqual(before);
    expect(changes).toEqual([]);
    await expect(credentials.getAuth(id)).resolves.toEqual({ authorization: FAKE_API_KEY });
  });

  it('a rejected key changes nothing', async () => {
    const { id } = await connectLinear();
    service.markNeedsReauth(id);
    const before = snapshot();

    await expect(
      service.reconnect(id, { type: AuthType.API_KEY, apiKey: 'bad_key' }),
    ).rejects.toThrow();

    expect(snapshot()).toEqual(before);
  });

  it("runs the provider's OAuth flow again for an OAuth integration", async () => {
    const { id } = await connectCalendar();
    service.markNeedsReauth(id);
    oauth.authorize.mockResolvedValueOnce({
      accessToken: FAKE_ACCESS_TOKEN,
      refreshToken: 'refresh_after_reconnect',
      expiresAt: null,
      scopes: ['calendar'],
    });

    const reconnected = await service.reconnect(id, { type: AuthType.OAUTH });

    expect(reconnected.status).toBe(IntegrationStatus.CONNECTED);
    expect(oauth.authorize).toHaveBeenCalledTimes(2);
    expect(oauth.authorize.mock.calls[1][0]).toBe(google.oauth);
    await service.disconnect(id, { keepLocalCopies: true });
    expect(oauth.revoke.mock.calls[0][1].refreshToken).toBe('refresh_after_reconnect');
  });

  it('a disabled integration stays disabled with its new credentials', async () => {
    const { id } = await connectLinear();
    await service.setEnabled(id, false);
    const changes: IntegrationChange[] = [];
    service.onChange((change) => changes.push(change));

    const reconnected = await service.reconnect(id, {
      type: AuthType.API_KEY,
      apiKey: FAKE_API_KEY,
    });

    expect(reconnected.status).toBe(IntegrationStatus.DISABLED);
    expect(reconnected.sources.every((source) => !source.enabled)).toBe(true);
    expect(changes).toEqual([]);
  });

  it('throws NotFoundError for an unknown integration', async () => {
    await expect(
      service.reconnect('int_missing' as IntegrationId, {
        type: AuthType.API_KEY,
        apiKey: FAKE_API_KEY,
      }),
    ).rejects.toThrow(NotFoundError);
  });
});
