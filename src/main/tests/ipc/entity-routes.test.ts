import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import type { CalendarId, ProjectId } from '@common/ids';
import { AuthType, Provider, SourceType } from '@common/integrations';
import type { DevBrain, Workspace } from '@main/core';
import type { Event } from '@main/core/events/types';
import type { FavoritedEntity } from '@main/core/favorites/types';
import type { Note } from '@main/core/notes/types';
import type { RecentEntity } from '@main/core/recents/types';
import { ProjectStatus, type Project, type ProjectStats } from '@main/core/projects/types';
import type { SearchResult } from '@main/core/search/types';
import type { Page } from '@main/core/shared/pagination';
import { calendars } from '@main/db/schema/calendars';
import { externalLinks, externalSources, integrations } from '@main/db/schema/integrations';
import { ChangeTracker } from '@main/ipc/changes';
import { appRouter } from '@main/ipc/router';
import { attachRouter } from '@main/ipc/server';
import { resetElectronMock } from '../__mocks__/electron';
import { call, createWorkspace, tempDevBrain, testContext } from './helpers';

// The notes, projects, events, favorites, recents and search routes end to end, through the transport and
// the change tracker, over a real DevBrain folder.

let devBrain: DevBrain;
let cleanup: () => Promise<void>;

const DUE = new Date('2026-11-02T00:00:00.000Z');
const NINE = new Date('2026-11-02T09:00:00.000Z');
const TEN = new Date('2026-11-02T10:00:00.000Z');

beforeEach(async () => {
  ({ devBrain, cleanup } = await tempDevBrain());
  await devBrain.workspaces.open(await createWorkspace(devBrain, 'Work'));
  const tracker = new ChangeTracker(vi.fn());
  tracker.watch(devBrain);
  attachRouter(appRouter, { createContext: testContext(devBrain), changeTracker: tracker });
});

afterEach(async () => {
  resetElectronMock();
  await cleanup();
});

function workspace(): Workspace {
  return devBrain.currentWorkspace!;
}

// what a call returned, for one that succeeded
async function data<T>(...args: Parameters<typeof call>): Promise<T> {
  const result = await call<T>(...args);
  if (!result.ok) throw new Error(`${args[0]} failed: ${JSON.stringify(result.error)}`);
  return result.data;
}

const mutate = (path: string, input: unknown) => call(path, input, 'mutation');

// Rows as sync writes them, straight into the workspace's database: nothing in core writes a link
// outside sync.

function dbOf(ws: Workspace): BetterSQLite3Database {
  return (ws as unknown as { db: BetterSQLite3Database }).db;
}

function source(provider: Provider, sourceType: SourceType) {
  const db = dbOf(workspace());
  const integrationId = db
    .insert(integrations)
    .values({
      provider,
      authType: provider === Provider.LINEAR ? AuthType.API_KEY : AuthType.OAUTH,
      accountId: `account-${provider}`,
      accountLabel: 'Ada',
      credentials: Buffer.from('ciphertext'),
    })
    .returning()
    .get().id;
  return db.insert(externalSources).values({ integrationId, sourceType }).returning().get().id;
}

// a project mirrored from Linear
function syncedProject(): ProjectId {
  const ws = workspace();
  const { id } = ws.projects.createProject({ title: 'Mirrored', dueDate: DUE });
  dbOf(ws)
    .insert(externalLinks)
    .values({
      sourceId: source(Provider.LINEAR, SourceType.TASKS),
      provider: Provider.LINEAR,
      externalId: 'project-1',
      externalKey: null,
      externalUrl: 'https://linear.app/acme/project/1',
      externalUpdatedAt: DUE,
      lastSyncedAt: DUE,
      projectId: id,
    })
    .run();
  return id;
}

// a calendar synced from Google
function syncedCalendar(): CalendarId {
  return dbOf(workspace())
    .insert(calendars)
    .values({
      sourceId: source(Provider.GOOGLE_CALENDAR, SourceType.EVENTS),
      externalId: 'ada@example.com',
      name: 'Ada',
    })
    .returning()
    .get().id;
}

describe('notes', () => {
  it('creates, lists a page at a time, gets and renames notes, each returning the row', async () => {
    const created = await mutate('notes.create', { title: 'Plan' });
    expect(created).toMatchObject({ ok: true, data: { title: 'Plan' }, changed: ['note'] });
    const plan = (created as { data: Note }).data;
    await data<Note>('notes.create', { title: 'Retro' }, 'mutation');

    const first = await data<Page<Note>>('notes.list', { sort: { sortBy: 'title' }, limit: 1 });
    expect(first.items.map(({ title }) => title)).toEqual(['Retro']);
    const second = await data<Page<Note>>('notes.list', {
      sort: { sortBy: 'title' },
      limit: 1,
      cursor: first.nextCursor,
    });
    expect(second.items.map(({ title }) => title)).toEqual(['Plan']);
    expect(await call('notes.get', { id: plan.id })).toMatchObject({
      ok: true,
      data: { id: plan.id },
      changed: [],
    });

    expect(await mutate('notes.update', { id: plan.id, title: 'Q4 plan' })).toMatchObject({
      ok: true,
      data: { title: 'Q4 plan' },
      changed: ['note'],
    });
  });

  it("returns note in changed from updateContent, after the note's file is written", async () => {
    const note = await workspace().notes.createNote({ title: 'Plan' });

    const result = await mutate('notes.updateContent', { id: note.id, content: '# Goals\n\nShip' });

    expect(result).toMatchObject({
      ok: true,
      data: { preview: 'Goals\n\nShip' },
      changed: ['note'],
    });
    expect(workspace().search.search({ query: 'ship', entityType: ['note'] })).toHaveLength(1);
  });

  it("passes core's errors through, with what committed", async () => {
    const missing = await mutate('notes.updateContent', { id: 'nte_missing', content: 'x' });
    expect(missing).toMatchObject({
      ok: false,
      error: { data: { code: 'not_found' } },
      changed: [],
    });

    // core refuses a note linked to both
    const both = await mutate('notes.create', { linkedTaskId: 'tsk_1', linkedEventId: 'evt_1' });
    expect(both).toMatchObject({
      ok: false,
      error: {
        message: 'Notes cannot be linked to both an event and a task',
        data: { code: 'invalid_input' },
      },
      changed: [],
    });
    expect(await call('notes.get', { id: 'tsk_1' })).toMatchObject({
      error: { data: { code: 'invalid_input' } },
    });
  });

  it('sets the favorite wanted, reporting nothing when it already was', async () => {
    const note = await workspace().notes.createNote({ title: 'Plan' });

    const favorited = await mutate('notes.setFavorite', { id: note.id, favorite: true });
    expect(favorited).toMatchObject({
      ok: true,
      data: { favoritedAt: expect.any(Date) },
      changed: ['note'],
    });
    expect(await mutate('notes.setFavorite', { id: note.id, favorite: true })).toMatchObject({
      ok: true,
      changed: [],
    });
    expect(await mutate('notes.setFavorite', { id: note.id, favorite: false })).toMatchObject({
      ok: true,
      data: { favoritedAt: null },
      changed: ['note'],
    });
  });
});

describe('projects', () => {
  it('creates, lists, updates and completes a project, with its task stats', async () => {
    const created = await mutate('projects.create', { title: ' Launch ', dueDate: DUE });
    expect(created).toMatchObject({
      ok: true,
      data: { title: 'Launch', status: ProjectStatus.NOT_STARTED, external: null },
      changed: ['project'],
    });
    const { id } = (created as { data: Project }).data;
    workspace().tasks.createTask({ title: 'Write', dueDate: DUE, projectId: id });

    expect(await mutate('projects.update', { id, color: '#336699' })).toMatchObject({
      ok: true,
      data: { color: '#336699' },
      changed: ['project'],
    });
    const completed = await mutate('projects.updateStatus', {
      id,
      status: ProjectStatus.COMPLETED,
    });
    expect(completed).toMatchObject({
      ok: true,
      data: { status: ProjectStatus.COMPLETED, completedAt: expect.any(Date) },
      changed: ['project'],
    });

    const done = await data<Page<Project>>('projects.list', {
      filter: { status: ProjectStatus.COMPLETED },
    });
    expect(done.items.map((project) => project.id)).toEqual([id]);
    expect(await data<ProjectStats>('projects.stats', { id })).toMatchObject({
      numOfNotStarted: 1,
      totalTasks: 1,
    });
    expect(await data<Project>('projects.get', { id })).toMatchObject({ id, title: 'Launch' });
  });

  it("refuses an edit to a synced project with core's external_read_only, but favorites it", async () => {
    const id = syncedProject();

    expect(await mutate('projects.update', { id, title: 'Mine' })).toMatchObject({
      ok: false,
      error: { data: { code: 'external_read_only' } },
      changed: [],
    });
    expect(await mutate('projects.setFavorite', { id, favorite: true })).toMatchObject({
      ok: true,
      changed: ['project'],
    });
    expect(await mutate('projects.setFavorite', { id, favorite: true })).toMatchObject({
      ok: true,
      changed: [],
    });
  });

  it('refuses a blank title, a colour that is not #rrggbb and an unknown status', async () => {
    const code = async (path: string, input: unknown) =>
      ((await mutate(path, input)) as { error?: { data: { code: string } } }).error?.data.code;

    expect(await code('projects.create', { title: ' ', dueDate: DUE })).toBe('invalid_input');
    expect(await code('projects.create', { title: 'X', dueDate: DUE, color: 'red' })).toBe(
      'invalid_input',
    );
    expect(await code('projects.updateStatus', { id: 'prj_1', status: 9 })).toBe('invalid_input');
    expect(await call('projects.stats', { id: 'prj_missing' })).toMatchObject({
      error: { data: { code: 'not_found' } },
    });
  });
});

describe('events', () => {
  it('creates, lists for a range, updates and deletes an event', async () => {
    const created = await mutate('events.create', {
      title: 'Standup',
      startAt: NINE,
      endAt: TEN,
      meetingUrl: 'https://meet.example/abc',
    });
    expect(created).toMatchObject({
      ok: true,
      data: { title: 'Standup', meetingUrl: 'https://meet.example/abc', exdates: [] },
      changed: ['event'],
    });
    const { id } = (created as { data: Event }).data;

    const inRange = await data<Event[]>('events.listForCalendar', { start: NINE, end: TEN });
    expect(inRange.map((event) => event.id)).toEqual([id]);
    expect(
      await data<Event[]>('events.listForCalendar', {
        start: new Date(TEN.getTime() + 1),
        end: DUE,
      }),
    ).toEqual([]);

    expect(await mutate('events.update', { id, location: 'Room 1', color: null })).toMatchObject({
      ok: true,
      data: { location: 'Room 1', color: null },
      changed: ['event'],
    });
    expect(await mutate('events.delete', { id })).toEqual({
      ok: true,
      data: undefined,
      changed: ['event'],
    });
    expect(await call('events.get', { id })).toMatchObject({
      error: { data: { code: 'not_found' } },
    });
  });

  it("refuses an event on a synced calendar with core's external_read_only", async () => {
    const calendarId = syncedCalendar();

    expect(
      await mutate('events.create', { title: 'Mine', calendarId, startAt: NINE, endAt: TEN }),
    ).toMatchObject({ ok: false, error: { data: { code: 'external_read_only' } }, changed: [] });
  });

  it("passes core's own checks, and refuses a link that could not be opened", async () => {
    // core: the end before the start
    expect(
      await mutate('events.create', { title: 'Backwards', startAt: TEN, endAt: NINE }),
    ).toMatchObject({
      ok: false,
      error: { message: 'endAt must not be before startAt', data: { code: 'invalid_input' } },
    });
    expect(
      await mutate('events.create', {
        title: 'X',
        startAt: NINE,
        endAt: TEN,
        meetingUrl: 'javascript:alert(1)',
      }),
    ).toMatchObject({ ok: false, error: { data: { code: 'invalid_input' } } });
    expect(
      await mutate('events.create', {
        title: 'X',
        startAt: NINE,
        endAt: TEN,
        timeZone: 'Mars/Base',
      }),
    ).toMatchObject({ ok: false, error: { data: { code: 'invalid_input' } } });
  });

  it('sets the favorite wanted, reporting nothing when it already was', async () => {
    const event = workspace().events.createEvent({ title: 'Standup', startAt: NINE, endAt: TEN });

    expect(await mutate('events.setFavorite', { id: event.id, favorite: true })).toMatchObject({
      ok: true,
      data: { favoritedAt: expect.any(Date) },
      changed: ['event'],
    });
    expect(await mutate('events.setFavorite', { id: event.id, favorite: true })).toMatchObject({
      ok: true,
      changed: [],
    });
  });
});

describe('favorites', () => {
  it('lists the favorites, most recent first, a page at a time and by entity type', async () => {
    const ws = workspace();
    const note = await ws.notes.createNote({ title: 'Plan' });
    const project = ws.projects.createProject({ title: 'Launch', dueDate: DUE });
    await mutate('notes.setFavorite', { id: note.id, favorite: true });
    // favoritedAt is stored to the millisecond
    await new Promise((resolve) => setTimeout(resolve, 5));
    await mutate('projects.setFavorite', { id: project.id, favorite: true });

    const first = await call<Page<FavoritedEntity>>('favorites.list', { limit: 1 });
    expect(first).toMatchObject({
      ok: true,
      data: { items: [{ id: project.id, entityType: 'projects', title: 'Launch' }] },
      changed: [],
    });
    const second = await data<Page<FavoritedEntity>>('favorites.list', {
      limit: 1,
      cursor: (first as { data: Page<FavoritedEntity> }).data.nextCursor,
    });
    expect(second).toMatchObject({ items: [{ id: note.id }], nextCursor: null });
    // tRPC's infinite queries can start from a null cursor
    expect(await data<Page<FavoritedEntity>>('favorites.list', { cursor: null })).toMatchObject({
      items: [{ id: project.id }, { id: note.id }],
    });
    const notes = await data<Page<FavoritedEntity>>('favorites.list', { entityType: 'notes' });
    expect(notes.items.map(({ id }) => id)).toEqual([note.id]);
  });

  it("passes core's invalid_cursor, and refuses an unknown entity type", async () => {
    expect(await call('favorites.list', { cursor: 'not-a-cursor' })).toMatchObject({
      ok: false,
      error: { data: { code: 'invalid_cursor' } },
    });
    expect(await call('favorites.list', { entityType: 'calendars' })).toMatchObject({
      ok: false,
      error: { data: { code: 'invalid_input' } },
    });
  });
});

describe('recents', () => {
  it('records a view of each entity type, reporting recent alone', async () => {
    const ws = workspace();
    const task = ws.tasks.createTask({ title: 'Ship', dueDate: DUE });
    const note = await ws.notes.createNote({ title: 'Plan' });
    const event = ws.events.createEvent({ title: 'Standup', startAt: NINE, endAt: TEN });

    expect(await mutate('recents.recordView', { id: task.id })).toMatchObject({
      ok: true,
      data: { id: task.id, entityType: 'tasks', title: 'Ship', viewedAt: expect.any(Date) },
      changed: ['recent'],
    });
    expect(await mutate('recents.recordView', { id: note.id })).toMatchObject({
      ok: true,
      data: { entityType: 'notes' },
    });
    expect(await mutate('recents.recordView', { id: event.id })).toMatchObject({
      ok: true,
      data: { entityType: 'events' },
    });
  });

  it("refuses an id of another kind, and passes core's not_found", async () => {
    const calendarId = workspace().calendars.list()[0].id;
    expect(await mutate('recents.recordView', { id: calendarId })).toMatchObject({
      ok: false,
      error: { data: { code: 'invalid_input' } },
      changed: [],
    });
    expect(await mutate('recents.recordView', { id: 'tsk_missing' })).toMatchObject({
      ok: false,
      error: { data: { code: 'not_found' } },
      changed: [],
    });
  });

  it('lists the recents, most recent first, a page at a time and by entity type', async () => {
    const ws = workspace();
    const note = await ws.notes.createNote({ title: 'Plan' });
    const project = ws.projects.createProject({ title: 'Launch', dueDate: DUE });
    await mutate('recents.recordView', { id: note.id });
    // viewedAt is stored to the millisecond
    await new Promise((resolve) => setTimeout(resolve, 5));
    await mutate('recents.recordView', { id: project.id });

    const first = await call<Page<RecentEntity>>('recents.list', { limit: 1 });
    expect(first).toMatchObject({
      ok: true,
      data: { items: [{ id: project.id, entityType: 'projects', title: 'Launch' }] },
      changed: [],
    });
    const second = await data<Page<RecentEntity>>('recents.list', {
      limit: 1,
      cursor: (first as { data: Page<RecentEntity> }).data.nextCursor,
    });
    expect(second).toMatchObject({ items: [{ id: note.id }], nextCursor: null });
    expect(await data<Page<RecentEntity>>('recents.list', { cursor: null })).toMatchObject({
      items: [{ id: project.id }, { id: note.id }],
    });
    const notes = await data<Page<RecentEntity>>('recents.list', { entityType: 'notes' });
    expect(notes.items.map(({ id }) => id)).toEqual([note.id]);
  });

  it("passes core's invalid_cursor, and refuses an unknown entity type", async () => {
    expect(await call('recents.list', { cursor: 'not-a-cursor' })).toMatchObject({
      ok: false,
      error: { data: { code: 'invalid_cursor' } },
    });
    expect(await call('recents.list', { entityType: 'calendars' })).toMatchObject({
      ok: false,
      error: { data: { code: 'invalid_input' } },
    });
  });
});

describe('search', () => {
  it('returns matches with their text escaped and the matches alone in <b>', async () => {
    const ws = workspace();
    const note = await ws.notes.createNote({ title: '<img src=x onerror=alert(1)> roadmap' });
    ws.projects.createProject({ title: 'Roadmap review', dueDate: DUE });

    const results = await data<SearchResult[]>('search.search', { query: 'roadmap' });
    expect(results).toHaveLength(2);
    const noteResult = results.find(({ entityId }) => entityId === note.id);
    expect(noteResult?.title).toBe('&lt;img src=x onerror=alert(1)&gt; <b>roadmap</b>');

    const projects = await data<SearchResult[]>('search.search', {
      query: 'roadmap',
      entityType: ['project'],
    });
    expect(projects).toMatchObject([{ entityType: 'project', title: '<b>Roadmap</b> review' }]);
  });

  it('refuses a limit that is not a whole number within a page', async () => {
    for (const limit of [0, 1.5, 201]) {
      expect(await call('search.search', { query: 'x', limit })).toMatchObject({
        ok: false,
        error: { data: { code: 'invalid_input' } },
      });
    }
  });
});
