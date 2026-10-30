import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import { EventId, ExternalSourceId, TaskId } from '@common/ids';
import { externalLinks, externalSources, integrations } from '@main/db/schema/integrations';
import { createDb } from '../utils';
import { FavoriteChange, FavoritesService } from '../../favorites/service';
import { ArchiveService } from '../../archive/service';
import { EventService } from '../../events/service';
import { NoteService } from '../../notes/service';
import { ProjectService } from '../../projects/service';
import { TaskService } from '../../tasks/service';
import { AuthType, LinkState, Provider, SourceType } from '../../integrations/types';
import { InvalidCursorError } from '../../shared/pagination';
import { NotFoundError } from '../../shared/errors';
import type { FavoritableEntityType } from '../../favorites/types';

const TOMORROW = new Date(Date.now() + 24 * 60 * 60 * 1000);

let db: BetterSQLite3Database;
let favorites: FavoritesService;
let archive: ArchiveService;
let tasks: TaskService;
let projects: ProjectService;
let notesService: NoteService;
let events: EventService;
let workspacePath: string;

beforeEach(async () => {
  db = createDb();
  workspacePath = await fs.mkdtemp(path.join(os.tmpdir(), 'devbrain-favorites-'));
  await fs.mkdir(path.join(workspacePath, 'notes'), { recursive: true });

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

// favoritedAt is stamped with Date.now(), so writes are spread out for a deterministic order
const tick = () => new Promise((resolve) => setTimeout(resolve, 2));

function createEvent(title: string) {
  const startAt = new Date(TOMORROW);
  return events.createEvent({
    title,
    startAt,
    endAt: new Date(startAt.getTime() + 60 * 60 * 1000),
  });
}

// one entity of each type, with a function that favorites it
async function oneOfEach(suffix = '') {
  const task = tasks.createTask({ title: `T${suffix}`, dueDate: TOMORROW });
  const project = projects.createProject({ title: `P${suffix}`, dueDate: TOMORROW });
  const note = await notesService.createNote({ title: `N${suffix}` });
  const event = createEvent(`E${suffix}`);
  return [
    { id: task.id, entityType: 'tasks', favorite: () => favorites.favoriteTask(task.id) },
    {
      id: project.id,
      entityType: 'projects',
      favorite: () => favorites.favoriteProject(project.id),
    },
    { id: note.id, entityType: 'notes', favorite: () => favorites.favoriteNote(note.id) },
    { id: event.id, entityType: 'events', favorite: () => favorites.favoriteEvent(event.id) },
  ] as const;
}

describe('FavoritesService — favorite and unfavorite', () => {
  it('stamps and clears favoritedAt on each entity type', async () => {
    const task = tasks.createTask({ title: 'T', dueDate: TOMORROW });
    const project = projects.createProject({ title: 'P', dueDate: TOMORROW });
    const note = await notesService.createNote({ title: 'N' });
    const event = createEvent('E');

    expect(favorites.favoriteTask(task.id).favoritedAt).toBeInstanceOf(Date);
    expect(favorites.favoriteProject(project.id).favoritedAt).toBeInstanceOf(Date);
    expect(favorites.favoriteNote(note.id).favoritedAt).toBeInstanceOf(Date);
    expect(favorites.favoriteEvent(event.id).favoritedAt).toBeInstanceOf(Date);
    expect(tasks.getById(task.id).favoritedAt).toBeInstanceOf(Date);
    expect(events.getById(event.id).favoritedAt).toBeInstanceOf(Date);

    expect(favorites.unfavoriteTask(task.id).favoritedAt).toBeNull();
    expect(favorites.unfavoriteProject(project.id).favoritedAt).toBeNull();
    expect(favorites.unfavoriteNote(note.id).favoritedAt).toBeNull();
    expect(favorites.unfavoriteEvent(event.id).favoritedAt).toBeNull();
    expect(tasks.getById(task.id).favoritedAt).toBeNull();
    expect(events.getById(event.id).favoritedAt).toBeNull();
  });

  it('returns the read model, with external and exdates', () => {
    const task = tasks.createTask({ title: 'T', dueDate: TOMORROW });
    const event = createEvent('E');

    expect(favorites.favoriteTask(task.id).external).toBeNull();
    const favorited = favorites.favoriteEvent(event.id);
    expect(favorited.external).toBeNull();
    expect(favorited.exdates).toEqual([]);
  });

  it('leaves updatedAt as it was', async () => {
    const task = tasks.createTask({ title: 'T', dueDate: TOMORROW });
    const note = await notesService.createNote({ title: 'N' });
    await tick();

    expect(favorites.favoriteTask(task.id).updatedAt).toEqual(task.updatedAt);
    expect(favorites.unfavoriteTask(task.id).updatedAt).toEqual(task.updatedAt);
    expect(favorites.favoriteNote(note.id).updatedAt).toEqual(note.updatedAt);
  });

  it('refuses an entity that does not exist', () => {
    expect(() => favorites.favoriteTask('tsk_missing' as TaskId)).toThrow(NotFoundError);
    expect(() => favorites.unfavoriteEvent('evt_missing' as EventId)).toThrow(NotFoundError);
  });

  it('is idempotent: favoriting again keeps the first favoritedAt', async () => {
    const task = tasks.createTask({ title: 'T', dueDate: TOMORROW });
    const event = createEvent('E');

    expect(favorites.unfavoriteTask(task.id).favoritedAt).toBeNull();
    const first = favorites.favoriteTask(task.id);
    const firstEvent = favorites.favoriteEvent(event.id);
    await tick();

    const again = favorites.favoriteTask(task.id);
    expect(again.favoritedAt).toEqual(first.favoritedAt);
    expect(again.external).toBeNull();
    expect(favorites.favoriteEvent(event.id)).toEqual(firstEvent);
    expect(tasks.getById(task.id).favoritedAt).toEqual(first.favoritedAt);

    favorites.unfavoriteTask(task.id);
    expect(favorites.unfavoriteTask(task.id).favoritedAt).toBeNull();
  });

  it('changes only the entity named, with no cascade', async () => {
    const project = projects.createProject({ title: 'P', dueDate: TOMORROW });
    const task = tasks.createTask({ title: 'T', dueDate: TOMORROW, projectId: project.id });
    const subtask = tasks.createSubtask(task.id, { title: 'S', dueDate: TOMORROW });

    favorites.favoriteProject(project.id);
    favorites.favoriteTask(task.id);

    expect(tasks.getById(subtask.id).favoritedAt).toBeNull();
    expect(
      favorites
        .listFavorites()
        .items.map((e) => e.entity.id)
        .sort(),
    ).toEqual([project.id, task.id].sort());
  });

  it('favorites a task synced from an integration', () => {
    const task = tasks.createTask({ title: 'Synced', dueDate: TOMORROW });
    link({ taskId: task.id }, LinkState.SYNCED);

    const favorited = favorites.favoriteTask(task.id);
    expect(favorited.favoritedAt).toBeInstanceOf(Date);
    expect(favorited.external?.state).toBe(LinkState.SYNCED);
  });
});

describe('FavoritesService — onChange', () => {
  it('sends each favorite and unfavorite after it is written', async () => {
    const [task, , , event] = await oneOfEach();
    const changes: FavoriteChange[] = [];
    favorites.onChange((change) => changes.push(change));

    const favorited = favorites.favoriteTask(task.id as TaskId);
    favorites.favoriteEvent(event.id as EventId);
    favorites.unfavoriteTask(task.id as TaskId);

    expect(changes).toEqual([
      { type: 'favorited', entityType: 'tasks', id: task.id, favoritedAt: favorited.favoritedAt },
      { type: 'favorited', entityType: 'events', id: event.id, favoritedAt: expect.any(Date) },
      { type: 'unfavorited', entityType: 'tasks', id: task.id },
    ]);
  });

  it('sends nothing when nothing changed or the entity is missing', () => {
    const task = tasks.createTask({ title: 'T', dueDate: TOMORROW });
    favorites.favoriteTask(task.id);
    const listener = vi.fn();
    favorites.onChange(listener);

    favorites.favoriteTask(task.id);
    favorites.unfavoriteTask(task.id);
    favorites.unfavoriteTask(task.id);
    expect(() => favorites.favoriteTask('tsk_missing' as TaskId)).toThrow();

    expect(listener.mock.calls.map(([change]) => change.type)).toEqual(['unfavorited']);
  });

  it('a listener that throws does not fail the favorite', () => {
    const task = tasks.createTask({ title: 'T', dueDate: TOMORROW });
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    favorites.onChange(() => {
      throw new Error('listener failed');
    });

    try {
      expect(favorites.favoriteTask(task.id).favoritedAt).not.toBeNull();
    } finally {
      error.mockRestore();
    }
    expect(favorites.listFavorites().items.map((e) => e.entity.id)).toEqual([task.id]);
  });
});

describe('FavoritesService — listFavorites', () => {
  it('returns an empty list when nothing is favorited', async () => {
    await oneOfEach();
    expect(favorites.listFavorites().items).toEqual([]);
  });

  it('returns every entity type, most recently favorited first, as its service reads it', async () => {
    const created = await oneOfEach();
    const favorited: { favoritedAt: Date | null }[] = [];
    for (const entity of created) {
      favorited.push(entity.favorite());
      await tick();
    }

    const items = favorites.listFavorites().items;
    expect(items).toEqual(
      created
        .map((entity, i) => ({
          entityType: entity.entityType,
          entity: favorited[i],
          favoritedAt: favorited[i].favoritedAt,
        }))
        .reverse(),
    );
    expect(items[0].favoritedAt).toBeInstanceOf(Date);
  });

  it('leaves out unfavorited entities', async () => {
    const [task, project] = await oneOfEach();
    task.favorite();
    project.favorite();
    favorites.unfavoriteTask(task.id as TaskId);

    expect(favorites.listFavorites().items.map((e) => e.entity.id)).toEqual([project.id]);
  });

  it('leaves out archived entities until they are restored', async () => {
    const project = projects.createProject({ title: 'P', dueDate: TOMORROW });
    const task = tasks.createTask({ title: 'T', dueDate: TOMORROW, projectId: project.id });
    favorites.favoriteTask(task.id);

    archive.archiveProject(project.id);
    expect(favorites.listFavorites().items).toEqual([]);
    expect(favorites.listFavorites({ entityType: 'tasks' }).items).toEqual([]);

    archive.restoreProject(project.id);
    expect(favorites.listFavorites().items.map((e) => e.entity.id)).toEqual([task.id]);
  });

  it('leaves out events whose provider item was removed', () => {
    const kept = createEvent('Kept');
    const removed = createEvent('Removed');
    favorites.favoriteEvent(kept.id);
    favorites.favoriteEvent(removed.id);
    link({ eventId: removed.id }, LinkState.REMOVED);

    expect(favorites.listFavorites().items.map((e) => e.entity.id)).toEqual([kept.id]);
    expect(favorites.listFavorites({ entityType: 'events' }).items.map((e) => e.entity.id)).toEqual(
      [kept.id],
    );
  });

  it.each(['tasks', 'projects', 'notes', 'events'] as const)(
    'filters to %s, most recently favorited first',
    async (entityType) => {
      const created = [...(await oneOfEach('0')), ...(await oneOfEach('1'))];
      for (const entity of created) {
        entity.favorite();
        await tick();
      }

      const items = favorites.listFavorites({ entityType }).items;
      expect(items.map((e) => e.entity.id)).toEqual(
        created
          .filter((e) => e.entityType === entityType)
          .map((e) => e.id)
          .reverse(),
      );
    },
  );
});

describe('FavoritesService — listFavorites cursor pagination', () => {
  // two of each type favorited at distinct times, then four more at one shared instant to make
  // pages break ties on id across tables
  async function seed() {
    for (const suffix of ['0', '1']) {
      for (const entity of await oneOfEach(suffix)) {
        entity.favorite();
        await tick();
      }
    }
    vi.useFakeTimers({ toFake: ['Date'], now: Date.now() + 1000 });
    try {
      for (const entity of await oneOfEach('tied')) entity.favorite();
    } finally {
      vi.useRealTimers();
    }
  }

  it.each(['all', 'tasks', 'projects', 'notes', 'events'] as const)(
    "pages through the '%s' filter in the unpaginated order",
    async (entityType: FavoritableEntityType | 'all') => {
      await seed();
      const full = favorites
        .listFavorites({ entityType }, { limit: 200 })
        .items.map((e) => e.entity.id);
      expect(full).toHaveLength(entityType === 'all' ? 12 : 3);
      expect(new Set(full).size).toBe(full.length);

      for (const limit of [1, 2, 5]) {
        const ids: string[] = [];
        let cursor: string | undefined;
        do {
          const page = favorites.listFavorites({ entityType }, { limit, cursor });
          expect(page.items.length).toBeLessThanOrEqual(limit);
          ids.push(...page.items.map((e) => e.entity.id));
          cursor = page.nextCursor ?? undefined;
        } while (cursor);
        expect(ids).toEqual(full);
      }
    },
  );

  it('returns a null nextCursor when everything fits', async () => {
    const [task] = await oneOfEach();
    task.favorite();
    expect(favorites.listFavorites().nextCursor).toBeNull();
  });

  it('rejects an invalid limit, a garbage cursor and a cursor from another list', async () => {
    const a = tasks.createTask({ title: 'a', dueDate: TOMORROW });
    const b = tasks.createTask({ title: 'b', dueDate: TOMORROW });
    favorites.favoriteTask(a.id);
    favorites.favoriteTask(b.id);
    archive.archiveTask(a.id);
    archive.archiveTask(b.id);

    expect(() => favorites.listFavorites({}, { limit: 0 })).toThrow(RangeError);
    expect(() => favorites.listFavorites({}, { cursor: '!!' })).toThrow(InvalidCursorError);
    const archiveCursor = archive.listArchived({}, { limit: 1 }).nextCursor!;
    expect(() => favorites.listFavorites({}, { cursor: archiveCursor })).toThrow(
      InvalidCursorError,
    );
  });
});

// A link row, as SyncWriter would write it; nothing else writes links in these tests
let sourceId: ExternalSourceId | undefined;
let linkCount = 0;

function link(entity: { taskId: TaskId } | { eventId: EventId }, state: LinkState): void {
  if (sourceId === undefined || !db.select().from(externalSources).get()) {
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
    sourceId = db
      .insert(externalSources)
      .values({ integrationId, sourceType: SourceType.TASKS })
      .returning()
      .get().id;
  }
  linkCount += 1;
  const at = new Date('2026-10-01T12:00:00Z');
  db.insert(externalLinks)
    .values({
      sourceId,
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
