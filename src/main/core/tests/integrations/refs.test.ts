import { describe, it, expect, beforeEach } from 'vitest';
import { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import { EventId, ExternalSourceId, ProjectId, TaskId } from '@common/ids';
import { integrations, externalSources, externalLinks } from '@main/db/schema/integrations';
import { tasks as tasksTable } from '@main/db/schema/tasks';
import { eq } from 'drizzle-orm';
import { createDb } from '../utils';
import { TaskService } from '../../tasks/service';
import { ProjectService } from '../../projects/service';
import { EventService } from '../../events/service';
import { Task, TaskSortOptions } from '../../tasks/types';
import { getRefs } from '../../integrations/refs';
import { AuthType, LinkState, Provider, SourceType } from '../../integrations/types';
import { PageOptions } from '../../shared/pagination';

// The `external` field on read models and the `origin` filter. Nothing writes links yet
// (SyncWriter does, later), so these tests insert link rows directly.

const TOMORROW = new Date(Date.now() + 86_400_000);
const SYNCED_AT = new Date('2026-10-01T12:00:00Z');

let db: BetterSQLite3Database;
let tasks: TaskService;
let projects: ProjectService;
let events: EventService;
let sourceId: ExternalSourceId;
let linkCount = 0;

type Entity = { taskId: TaskId } | { projectId: ProjectId } | { eventId: EventId };

function link(entity: Entity, values: Partial<typeof externalLinks.$inferInsert> = {}) {
  linkCount += 1;
  db.insert(externalLinks)
    .values({
      sourceId,
      provider: Provider.LINEAR,
      externalId: `item-${linkCount}`,
      externalKey: `ENG-${linkCount}`,
      externalUrl: `https://linear.app/acme/issue/ENG-${linkCount}`,
      externalUpdatedAt: SYNCED_AT,
      lastSyncedAt: SYNCED_AT,
      ...entity,
      ...values,
    })
    .run();
}

async function allPages(
  list: (page: PageOptions) => Promise<{ items: Task[]; nextCursor: string | null }>,
): Promise<Task[]> {
  const items: Task[] = [];
  let cursor: string | undefined;
  do {
    const page = await list({ cursor, limit: 2 });
    items.push(...page.items);
    cursor = page.nextCursor ?? undefined;
  } while (cursor);
  return items;
}

const ids = (rows: { id: string }[]) => rows.map((r) => r.id).sort();

beforeEach(() => {
  db = createDb();
  tasks = new TaskService(db);
  projects = new ProjectService(db);
  events = new EventService(db);
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
});

describe('refs — tasks', () => {
  let synced: Task;
  let local: Task;

  beforeEach(async () => {
    synced = await tasks.createTask({ title: 'Synced', dueDate: TOMORROW });
    local = await tasks.createTask({ title: 'Local', dueDate: TOMORROW });
    link(
      { taskId: synced.id },
      {
        externalKey: 'ENG-123',
        externalUrl: 'https://linear.app/acme/issue/ENG-123',
        metadata: { statusLabel: 'In Review', priorityLabel: 'Urgent' },
      },
    );
  });

  const expectedRef = {
    provider: Provider.LINEAR,
    state: LinkState.SYNCED,
    key: 'ENG-123',
    url: 'https://linear.app/acme/issue/ENG-123',
    statusLabel: 'In Review',
    priorityLabel: 'Urgent',
    lastSyncedAt: SYNCED_AT,
  };

  it('getById returns the ref of a synced task and null for a local one', async () => {
    expect((await tasks.getById(synced.id)).external).toEqual(expectedRef);
    expect((await tasks.getById(local.id)).external).toBeNull();
  });

  it('getByIds fills each task', async () => {
    const rows = await tasks.getByIds([synced.id, local.id]);
    const byId = new Map(rows.map((r) => [r.id, r.external]));
    expect(byId.get(synced.id)).toEqual(expectedRef);
    expect(byId.get(local.id)).toBeNull();
  });

  it('listTasks fills each task', async () => {
    const { items } = await tasks.listTasks();
    const byId = new Map(items.map((r) => [r.id, r.external]));
    expect(byId.get(synced.id)).toEqual(expectedRef);
    expect(byId.get(local.id)).toBeNull();
  });

  it('listSubtasks fills each subtask', async () => {
    const child = await tasks.createSubtask(local.id, { title: 'Child' });
    link({ taskId: child.id }, { externalKey: 'ENG-124' });
    const { items } = await tasks.listSubtasks(local.id);
    expect(items).toHaveLength(1);
    expect(items[0].external).toMatchObject({ key: 'ENG-124', state: LinkState.SYNCED });
  });

  it('keeps the ref of a detached task, with its state', async () => {
    const detached = await tasks.createTask({ title: 'Detached', dueDate: TOMORROW });
    link({ taskId: detached.id }, { state: LinkState.DETACHED });
    expect((await tasks.getById(detached.id)).external?.state).toBe(LinkState.DETACHED);
  });

  it('reads missing labels as null', async () => {
    const bare = await tasks.createTask({ title: 'Bare', dueDate: TOMORROW });
    link({ taskId: bare.id }, { externalKey: null });
    expect((await tasks.getById(bare.id)).external).toMatchObject({
      key: null,
      statusLabel: null,
      priorityLabel: null,
    });
  });

  it('an unreadable metadata blob costs only the labels', async () => {
    const odd = await tasks.createTask({ title: 'Odd', dueDate: TOMORROW });
    link({ taskId: odd.id }, { metadata: { statusLabel: 42 } });
    expect((await tasks.getById(odd.id)).external).toMatchObject({
      key: expect.any(String),
      statusLabel: null,
      priorityLabel: null,
    });
  });
});

describe('refs — projects', () => {
  it('getById, getByIds and listProjects return the ref, with the status label only', async () => {
    const synced = await projects.createProject({ title: 'Synced', dueDate: TOMORROW });
    const local = await projects.createProject({ title: 'Local', dueDate: TOMORROW });
    link(
      { projectId: synced.id },
      { externalKey: null, metadata: { statusLabel: 'Planned', priorityLabel: 'Ignored' } },
    );
    const expectedRef = {
      provider: Provider.LINEAR,
      state: LinkState.SYNCED,
      key: null,
      url: expect.any(String),
      statusLabel: 'Planned',
      priorityLabel: null,
      lastSyncedAt: SYNCED_AT,
    };

    expect((await projects.getById(synced.id)).external).toEqual(expectedRef);
    expect((await projects.getById(local.id)).external).toBeNull();

    const fromIds = new Map(
      (await projects.getByIds([synced.id, local.id])).map((r) => [r.id, r.external]),
    );
    expect(fromIds.get(synced.id)).toEqual(expectedRef);
    expect(fromIds.get(local.id)).toBeNull();

    const fromList = new Map((await projects.listProjects()).items.map((r) => [r.id, r.external]));
    expect(fromList.get(synced.id)).toEqual(expectedRef);
    expect(fromList.get(local.id)).toBeNull();
  });
});

describe('refs — events', () => {
  const start = new Date('2026-10-05T09:00:00Z');
  const end = new Date('2026-10-05T10:00:00Z');
  const range = [new Date('2026-10-01T00:00:00Z'), new Date('2026-10-31T00:00:00Z')] as const;

  it('getById, getByIds and listEventsInRange return the ref, with no labels', async () => {
    const synced = await events.createEvent({ title: 'Synced', startAt: start, endAt: end });
    const local = await events.createEvent({ title: 'Local', startAt: start, endAt: end });
    link(
      { eventId: synced.id },
      {
        provider: Provider.GOOGLE_CALENDAR,
        externalKey: null,
        metadata: { calendarId: 'primary', response: 'accepted' },
      },
    );
    const expectedRef = {
      provider: Provider.GOOGLE_CALENDAR,
      state: LinkState.SYNCED,
      key: null,
      url: expect.any(String),
      statusLabel: null,
      priorityLabel: null,
      lastSyncedAt: SYNCED_AT,
    };

    expect((await events.getById(synced.id)).external).toEqual(expectedRef);
    expect((await events.getById(local.id)).external).toBeNull();

    const fromIds = new Map(
      (await events.getByIds([synced.id, local.id])).map((r) => [r.id, r.external]),
    );
    expect(fromIds.get(synced.id)).toEqual(expectedRef);
    expect(fromIds.get(local.id)).toBeNull();

    const fromRange = new Map(
      (await events.listEventsInRange(...range)).items.map((r) => [r.id, r.external]),
    );
    expect(fromRange.get(synced.id)).toEqual(expectedRef);
    expect(fromRange.get(local.id)).toBeNull();
  });

  it('listEventsInRange leaves out removed events and keeps every other kind', async () => {
    const removed = await events.createEvent({ title: 'Removed', startAt: start, endAt: end });
    const synced = await events.createEvent({ title: 'Synced', startAt: start, endAt: end });
    const local = await events.createEvent({ title: 'Local', startAt: start, endAt: end });
    link({ eventId: removed.id }, { state: LinkState.REMOVED, removedAt: SYNCED_AT });
    link({ eventId: synced.id });

    const { items } = await events.listEventsInRange(...range);
    expect(ids(items)).toEqual(ids([synced, local]));
    // still readable directly, for the notes linked to it
    expect((await events.getById(removed.id)).external?.state).toBe(LinkState.REMOVED);
  });
});

describe('refs — getRefs', () => {
  it('returns an empty map for no ids, without a query', async () => {
    expect((await getRefs(db, [])).size).toBe(0);
  });

  it('rejects ids of different entity types', async () => {
    const task = await tasks.createTask({ title: 'Task', dueDate: TOMORROW });
    const project = await projects.createProject({ title: 'Project', dueDate: TOMORROW });
    await expect(getRefs<TaskId | ProjectId>(db, [task.id, project.id])).rejects.toThrow(
      'one entity type at a time',
    );
  });
});

describe('TaskService — listTasks origin filter', () => {
  let synced: Task;
  let detached: Task;
  let removed: Task;
  let local: Task;

  beforeEach(async () => {
    synced = await tasks.createTask({ title: 'Synced', dueDate: TOMORROW });
    detached = await tasks.createTask({ title: 'Detached', dueDate: TOMORROW });
    removed = await tasks.createTask({ title: 'Removed', dueDate: TOMORROW });
    local = await tasks.createTask({ title: 'Local', dueDate: TOMORROW });
    link({ taskId: synced.id });
    link({ taskId: detached.id }, { state: LinkState.DETACHED });
    link({ taskId: removed.id }, { state: LinkState.REMOVED, removedAt: SYNCED_AT });
  });

  it('external returns only synced tasks', async () => {
    const { items } = await tasks.listTasks({ origin: 'external' });
    expect(ids(items)).toEqual(ids([synced]));
  });

  it('local returns every task without a synced link, detached ones included', async () => {
    const { items } = await tasks.listTasks({ origin: 'local' });
    expect(ids(items)).toEqual(ids([detached, removed, local]));
    expect(items.find((t) => t.id === detached.id)?.external?.state).toBe(LinkState.DETACHED);
  });

  it('no origin returns both', async () => {
    const { items } = await tasks.listTasks();
    expect(items).toHaveLength(4);
  });

  it('combines with the other filters', async () => {
    const { items } = await tasks.listTasks({ origin: 'external', excludeSubtasks: true });
    expect(ids(items)).toEqual(ids([synced]));
  });
});

describe('TaskService — listTasks origin filter pagination', () => {
  let external: Task[];
  let localTasks: Task[];

  beforeEach(async () => {
    external = [];
    localTasks = [];
    // the two kinds interleave, so page boundaries fall between them; due dates repeat to force
    // id tiebreaks, and every fifth task is undated so the dueDate sort crosses its null boundary
    for (let i = 0; i < 12; i++) {
      const task = await tasks.createTask({
        title: `Task ${i}`,
        dueDate: new Date(TOMORROW.getTime() + (i % 3) * 86_400_000),
      });
      if (i % 5 === 0)
        db.update(tasksTable).set({ dueDate: null }).where(eq(tasksTable.id, task.id)).run();
      if (i % 2 === 0) {
        link({ taskId: task.id });
        external.push(task);
      } else {
        // every other local task is a detached copy
        if (i % 4 === 1) link({ taskId: task.id }, { state: LinkState.DETACHED });
        localTasks.push(task);
      }
    }
  });

  const sorts: TaskSortOptions[] = [
    { sortBy: 'createdAt' },
    { sortBy: 'createdAt', direction: 'asc' },
    { sortBy: 'dueDate', direction: 'asc' },
    { sortBy: 'dueDate', direction: 'desc' },
    { sortBy: 'priority' },
  ];

  it.each(sorts)('pages through each side with no row skipped or repeated: %o', async (sort) => {
    for (const [origin, expected] of [
      ['external', external],
      ['local', localTasks],
    ] as const) {
      const paged = await allPages((page) => tasks.listTasks({ origin }, sort, page));
      expect(paged.map((t) => t.id)).toHaveLength(new Set(paged.map((t) => t.id)).size);
      expect(ids(paged)).toEqual(ids(expected));

      // the same order as one unpaged read
      const { items } = await tasks.listTasks({ origin }, sort, { limit: 200 });
      expect(paged.map((t) => t.id)).toEqual(items.map((t) => t.id));
    }
  });
});

describe('ProjectService — listProjects origin filter', () => {
  it('returns each side; a detached project counts as local; pages stay stable', async () => {
    const synced: ProjectId[] = [];
    const local: ProjectId[] = [];
    for (let i = 0; i < 7; i++) {
      const project = await projects.createProject({ title: `Project ${i}`, dueDate: TOMORROW });
      if (i % 2 === 0) {
        link({ projectId: project.id });
        synced.push(project.id);
      } else {
        if (i === 1) link({ projectId: project.id }, { state: LinkState.DETACHED });
        local.push(project.id);
      }
    }

    for (const [origin, expected] of [
      ['external', synced],
      ['local', local],
    ] as const) {
      const paged: string[] = [];
      let cursor: string | undefined;
      do {
        const page = await projects.listProjects(
          { origin },
          { sortBy: 'createdAt' },
          {
            cursor,
            limit: 2,
          },
        );
        paged.push(...page.items.map((p) => p.id));
        cursor = page.nextCursor ?? undefined;
      } while (cursor);
      expect([...paged].sort()).toEqual([...expected].sort());
      expect(new Set(paged).size).toBe(paged.length);
    }
  });
});
