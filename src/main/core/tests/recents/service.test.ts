import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import { EventId, NoteId, TaskId } from '@common/ids';
import { externalLinks, externalSources, integrations } from '@main/db/schema/integrations';
import { createDb } from '../utils';
import { RecentChange, RecentsService } from '../../recents/service';
import { ArchiveService } from '../../archive/service';
import { EventService } from '../../events/service';
import { FavoritesService } from '../../favorites/service';
import { NoteService } from '../../notes/service';
import { ProjectService } from '../../projects/service';
import { TaskService } from '../../tasks/service';
import { AuthType, LinkState, Provider, SourceType } from '../../integrations/types';
import { InvalidCursorError } from '../../shared/pagination';
import { NotFoundError } from '../../shared/errors';
import type { RecentEntityType } from '../../recents/types';

const TOMORROW = new Date(Date.now() + 24 * 60 * 60 * 1000);

let db: BetterSQLite3Database;
let recents: RecentsService;
let favorites: FavoritesService;
let archive: ArchiveService;
let tasks: TaskService;
let projects: ProjectService;
let notesService: NoteService;
let events: EventService;
let workspacePath: string;

beforeEach(async () => {
  db = createDb();
  workspacePath = await fs.mkdtemp(path.join(os.tmpdir(), 'devbrain-recents-'));
  await fs.mkdir(path.join(workspacePath, 'notes'), { recursive: true });

  recents = new RecentsService(db);
  favorites = new FavoritesService(db);
  archive = new ArchiveService(db);
  tasks = new TaskService(db);
  projects = new ProjectService(db);
  notesService = new NoteService(db, workspacePath);
  events = new EventService(db);
});

afterEach(async () => {
  await fs.rm(workspacePath, { recursive: true, force: true });
});

// viewedAt is stamped with Date.now(), so views are spread out for a deterministic order
const tick = () => new Promise((resolve) => setTimeout(resolve, 2));

function createEvent(title: string) {
  const startAt = new Date(TOMORROW);
  return events.createEvent({
    title,
    startAt,
    endAt: new Date(startAt.getTime() + 60 * 60 * 1000),
  });
}

// one entity of each type, in the order the list's types are tested in
async function oneOfEach(suffix = '') {
  const task = tasks.createTask({ title: `T${suffix}`, dueDate: TOMORROW });
  const project = projects.createProject({ title: `P${suffix}`, dueDate: TOMORROW });
  const note = await notesService.createNote({ title: `N${suffix}` });
  const event = createEvent(`E${suffix}`);
  return [
    { id: task.id, entityType: 'tasks', title: task.title },
    { id: project.id, entityType: 'projects', title: project.title },
    { id: note.id, entityType: 'notes', title: note.title },
    { id: event.id, entityType: 'events', title: event.title },
  ] as const;
}

describe('RecentsService — recordView', () => {
  it('stamps viewedAt on each entity type and returns its summary', async () => {
    for (const entity of await oneOfEach()) {
      const viewed = recents.recordView(entity.id);
      expect(viewed).toEqual({
        id: entity.id,
        entityType: entity.entityType,
        title: entity.title,
        viewedAt: expect.any(Date),
      });
    }
    const [task, , note, event] = await oneOfEach('2');
    const viewedAt = recents.recordView(task.id).viewedAt;
    expect(tasks.getById(task.id as TaskId).viewedAt).toEqual(viewedAt);
    recents.recordView(note.id);
    expect(notesService.getById(note.id as NoteId).viewedAt).toBeInstanceOf(Date);
    expect(events.getById(event.id as EventId).viewedAt).toBeNull();
  });

  it('leaves updatedAt and favoritedAt as they were', async () => {
    const task = tasks.createTask({ title: 'T', dueDate: TOMORROW });
    const note = await notesService.createNote({ title: 'N' });
    const event = createEvent('E');
    await tick();

    recents.recordView(task.id);
    recents.recordView(note.id);
    recents.recordView(event.id);

    expect(tasks.getById(task.id)).toMatchObject({ updatedAt: task.updatedAt, favoritedAt: null });
    expect(notesService.getById(note.id).updatedAt).toEqual(note.updatedAt);
    expect(events.getById(event.id).updatedAt).toEqual(event.updatedAt);
    expect(favorites.listFavorites().items).toEqual([]);
  });

  it('stamps again on every view, moving the entity back to the top', async () => {
    const [task, project] = await oneOfEach();
    const first = recents.recordView(task.id);
    await tick();
    recents.recordView(project.id);
    await tick();

    const again = recents.recordView(task.id);
    expect(again.viewedAt.getTime()).toBeGreaterThan(first.viewedAt.getTime());
    expect(recents.listRecents().items.map((e) => e.id)).toEqual([task.id, project.id]);
  });

  it('refuses an entity that does not exist, sending nothing', () => {
    const listener = vi.fn();
    recents.onChange(listener);

    expect(() => recents.recordView('tsk_missing' as TaskId)).toThrow(NotFoundError);
    expect(() => recents.recordView('evt_missing' as EventId)).toThrow(NotFoundError);
    expect(listener).not.toHaveBeenCalled();
  });

  it('records a view of a task synced from an integration', () => {
    const task = tasks.createTask({ title: 'Synced', dueDate: TOMORROW });
    link({ taskId: task.id }, LinkState.SYNCED);

    expect(recents.recordView(task.id).viewedAt).toBeInstanceOf(Date);
    expect(recents.listRecents().items.map((e) => e.id)).toEqual([task.id]);
  });
});

describe('RecentsService — onChange', () => {
  it('sends each view after it is written', async () => {
    const [task, , , event] = await oneOfEach();
    const changes: RecentChange[] = [];
    recents.onChange((change) => changes.push(change));

    const viewed = recents.recordView(task.id);
    recents.recordView(event.id);

    expect(changes).toEqual([
      { type: 'viewed', entityType: 'tasks', id: task.id, viewedAt: viewed.viewedAt },
      { type: 'viewed', entityType: 'events', id: event.id, viewedAt: expect.any(Date) },
    ]);
  });

  it('a listener that throws does not fail the view', () => {
    const task = tasks.createTask({ title: 'T', dueDate: TOMORROW });
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    recents.onChange(() => {
      throw new Error('listener failed');
    });

    try {
      expect(recents.recordView(task.id).viewedAt).toBeInstanceOf(Date);
    } finally {
      error.mockRestore();
    }
    expect(recents.listRecents().items.map((e) => e.id)).toEqual([task.id]);
  });
});

describe('RecentsService — listRecents', () => {
  it('returns an empty list when nothing was viewed', async () => {
    await oneOfEach();
    expect(recents.listRecents().items).toEqual([]);
  });

  it('returns every entity type, most recently viewed first, with its summary', async () => {
    const created = await oneOfEach();
    const viewed = [];
    for (const entity of created) {
      viewed.push(recents.recordView(entity.id));
      await tick();
    }

    expect(recents.listRecents().items).toEqual([...viewed].reverse());
  });

  it('shows the current title, not the one at the time of the view', () => {
    const task = tasks.createTask({ title: 'Before', dueDate: TOMORROW });
    recents.recordView(task.id);
    tasks.updateTask(task.id, { title: 'After' });

    expect(recents.listRecents().items).toMatchObject([{ id: task.id, title: 'After' }]);
  });

  it('leaves out archived entities until they are restored', async () => {
    const project = projects.createProject({ title: 'P', dueDate: TOMORROW });
    const task = tasks.createTask({ title: 'T', dueDate: TOMORROW, projectId: project.id });
    recents.recordView(task.id);

    archive.archiveProject(project.id);
    expect(recents.listRecents().items).toEqual([]);
    expect(recents.listRecents({ entityType: 'tasks' }).items).toEqual([]);

    archive.restoreProject(project.id);
    expect(recents.listRecents().items.map((e) => e.id)).toEqual([task.id]);
  });

  it('leaves out events whose provider item was removed, and deleted ones', () => {
    const kept = createEvent('Kept');
    const removed = createEvent('Removed');
    const deleted = createEvent('Deleted');
    for (const event of [kept, removed, deleted]) recents.recordView(event.id);
    link({ eventId: removed.id }, LinkState.REMOVED);
    events.deleteEvent(deleted.id);

    expect(recents.listRecents().items.map((e) => e.id)).toEqual([kept.id]);
    expect(recents.listRecents({ entityType: 'events' }).items.map((e) => e.id)).toEqual([kept.id]);
  });

  it('is independent of favorites', async () => {
    const [task, project] = await oneOfEach();
    favorites.favoriteTask(task.id as TaskId);
    recents.recordView(project.id);

    expect(recents.listRecents().items.map((e) => e.id)).toEqual([project.id]);
    expect(favorites.listFavorites().items.map((e) => e.id)).toEqual([task.id]);
  });

  it.each(['tasks', 'projects', 'notes', 'events'] as const)(
    'filters to %s, most recently viewed first',
    async (entityType) => {
      const created = [...(await oneOfEach('0')), ...(await oneOfEach('1'))];
      for (const entity of created) {
        recents.recordView(entity.id);
        await tick();
      }

      expect(recents.listRecents({ entityType }).items.map((e) => e.id)).toEqual(
        created
          .filter((e) => e.entityType === entityType)
          .map((e) => e.id)
          .reverse(),
      );
    },
  );
});

describe('RecentsService — listRecents cursor pagination', () => {
  // two of each type viewed at distinct times, then four more at one shared instant to make pages
  // break ties on id across tables
  async function seed() {
    for (const suffix of ['0', '1']) {
      for (const entity of await oneOfEach(suffix)) {
        recents.recordView(entity.id);
        await tick();
      }
    }
    const tied = await oneOfEach('tied');
    vi.useFakeTimers({ toFake: ['Date'], now: Date.now() + 1000 });
    try {
      for (const entity of tied) recents.recordView(entity.id);
    } finally {
      vi.useRealTimers();
    }
  }

  it.each(['all', 'tasks', 'projects', 'notes', 'events'] as const)(
    "pages through the '%s' filter in the unpaginated order",
    async (entityType: RecentEntityType | 'all') => {
      await seed();
      const full = recents.listRecents({ entityType }, { limit: 200 }).items.map((e) => e.id);
      expect(full).toHaveLength(entityType === 'all' ? 12 : 3);
      expect(new Set(full).size).toBe(full.length);

      for (const limit of [1, 2, 5]) {
        const ids: string[] = [];
        let cursor: string | undefined;
        do {
          const page = recents.listRecents({ entityType }, { limit, cursor });
          expect(page.items.length).toBeLessThanOrEqual(limit);
          ids.push(...page.items.map((e) => e.id));
          cursor = page.nextCursor ?? undefined;
        } while (cursor);
        expect(ids).toEqual(full);
      }
    },
  );

  it('rejects an invalid limit, a garbage cursor and a cursor from the favorites list', async () => {
    const a = tasks.createTask({ title: 'a', dueDate: TOMORROW });
    const b = tasks.createTask({ title: 'b', dueDate: TOMORROW });
    for (const task of [a, b]) {
      recents.recordView(task.id);
      favorites.favoriteTask(task.id);
    }

    expect(() => recents.listRecents({}, { limit: 0 })).toThrow(RangeError);
    expect(() => recents.listRecents({}, { cursor: '!!' })).toThrow(InvalidCursorError);
    const favoritesCursor = favorites.listFavorites({}, { limit: 1 }).nextCursor!;
    expect(() => recents.listRecents({}, { cursor: favoritesCursor })).toThrow(InvalidCursorError);
  });
});

// A link row, as SyncWriter would write it; nothing else writes links in these tests
let linkCount = 0;

function link(entity: { taskId: TaskId } | { eventId: EventId }, state: LinkState): void {
  let source = db.select().from(externalSources).get();
  if (!source) {
    const integrationId = db
      .insert(integrations)
      .values({
        provider: Provider.LINEAR,
        authType: AuthType.API_KEY,
        accountId: 'org:user',
        accountLabel: 'Ada, Acme',
        credentials: Buffer.from('ciphertext'),
      })
      .returning()
      .get().id;
    source = db
      .insert(externalSources)
      .values({ integrationId, sourceType: SourceType.TASKS })
      .returning()
      .get();
  }
  linkCount += 1;
  const at = new Date('2026-10-01T12:00:00Z');
  db.insert(externalLinks)
    .values({
      sourceId: source.id,
      provider: Provider.LINEAR,
      externalId: `item-${linkCount}`,
      externalKey: `ENG-${linkCount}`,
      externalUrl: `https://linear.app/acme/issue/ENG-${linkCount}`,
      externalUpdatedAt: at,
      lastSyncedAt: at,
      state,
      ...(state === LinkState.REMOVED && { removedAt: at }),
      ...entity,
    })
    .run();
}
