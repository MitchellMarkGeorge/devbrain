import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { NodeSQLiteDatabase } from '@main/db/node-sqlite';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { EventId, ExternalSourceId, generateId, ProjectId, TaskId } from '@common/ids';
import { integrations, externalSources, externalLinks } from '@main/db/schema/integrations';
import { tasks as tasksTable } from '@main/db/schema/tasks';
import { eq, or } from 'drizzle-orm';
import { createDb } from '../utils';
import { TaskService } from '../../tasks/service';
import { ProjectService } from '../../projects/service';
import { EventService } from '../../events/service';
import { ArchiveService } from '../../archive/service';
import { NoteService } from '../../notes/service';
import { Task, TaskStatus } from '../../tasks/types';
import { Project, ProjectStatus } from '../../projects/types';
import { Event } from '../../events/types';
import { assertEditable } from '../../integrations/refs';
import { AuthType, LinkState, Provider, SourceType } from '../../integrations/types';
import { ExternalReadOnlyError } from '../../shared/errors';

// Read-only guards on synced rows, and local tasks in mirrored projects. Nothing writes links yet
// (SyncWriter does, later), so these tests insert link rows directly.

const TOMORROW = new Date(Date.now() + 86_400_000);
const NEXT_WEEK = new Date(Date.now() + 7 * 86_400_000);
const SYNCED_AT = new Date('2026-10-01T12:00:00Z');

let db: NodeSQLiteDatabase;
let tasks: TaskService;
let projects: ProjectService;
let events: EventService;
let archive: ArchiveService;
let notes: NoteService;
let workspacePath: string;
let sourceId: ExternalSourceId;
let linkCount = 0;

type LinkedId = TaskId | ProjectId | EventId;

function entityColumn(id: LinkedId) {
  if (id.startsWith('tsk_')) return { taskId: id as TaskId };
  if (id.startsWith('prj_')) return { projectId: id as ProjectId };
  return { eventId: id as EventId };
}

async function link(id: LinkedId, state: LinkState = LinkState.SYNCED) {
  linkCount += 1;
  await db
    .insert(externalLinks)
    .values({
      sourceId,
      provider: Provider.LINEAR,
      externalId: `item-${linkCount}`,
      externalKey: `ENG-${linkCount}`,
      externalUrl: `https://linear.app/acme/issue/ENG-${linkCount}`,
      externalUpdatedAt: SYNCED_AT,
      lastSyncedAt: SYNCED_AT,
      state,
      ...entityColumn(id),
    })
    .run();
}

// what detach (feature 12) will do to the link
async function setState(id: LinkedId, state: LinkState) {
  // entity ids carry a per-type prefix, so at most one of these columns can match
  await db
    .update(externalLinks)
    .set({ state })
    .where(
      or(
        eq(externalLinks.taskId, id as TaskId),
        eq(externalLinks.projectId, id as ProjectId),
        eq(externalLinks.eventId, id as EventId),
      ),
    )
    .run();
}

// a child row the way SyncWriter will write one: straight into the table, at any depth
async function insertChild(parentTaskId: TaskId, title: string): Promise<TaskId> {
  return (
    await db
      .insert(tasksTable)
      .values({ title, dueDate: TOMORROW, parentTaskId, status: TaskStatus.NOT_STARTED })
      .returning()
      .get()
  ).id;
}

beforeEach(async () => {
  db = await createDb();
  tasks = new TaskService(db);
  projects = new ProjectService(db);
  events = new EventService(db);
  archive = new ArchiveService(db);
  workspacePath = await fs.mkdtemp(path.join(os.tmpdir(), 'devbrain-read-only-'));
  notes = new NoteService(db, workspacePath);
  const integrationId = (
    await db
      .insert(integrations)
      .values({
        provider: Provider.LINEAR,
        authType: AuthType.API_KEY,
        accountId: 'org:user',
        accountLabel: 'Ada, Acme',
        credentials: Buffer.from('ciphertext'),
      })
      .returning()
      .get()
  ).id;
  sourceId = (
    await db
      .insert(externalSources)
      .values({ integrationId, sourceType: SourceType.TASKS })
      .returning()
      .get()
  ).id;
});

afterEach(async () => {
  await fs.rm(workspacePath, { recursive: true, force: true });
});

describe('read-only guards — guarded methods', () => {
  // `target` is the row the case links; every other row in the fixture stays local
  interface Fixture {
    task: Task;
    other: Task;
    subtask: Task;
    project: Project;
    event: Event;
  }

  let f: Fixture;

  beforeEach(async () => {
    const parent = await tasks.createTask({ title: 'Parent', dueDate: TOMORROW });
    f = {
      task: await tasks.createTask({ title: 'Task', dueDate: TOMORROW }),
      other: await tasks.createTask({ title: 'Other', dueDate: TOMORROW }),
      subtask: await tasks.createSubtask(parent.id, { title: 'Subtask' }),
      project: await projects.createProject({ title: 'Project', dueDate: TOMORROW }),
      event: await events.createEvent({ title: 'Event', startAt: TOMORROW, endAt: NEXT_WEEK }),
    };
  });

  const cases: {
    method: string;
    target: (f: Fixture) => LinkedId;
    run: (f: Fixture) => unknown;
  }[] = [
    {
      method: 'TaskService.updateTask',
      target: (f) => f.task.id,
      run: (f) => tasks.updateTask(f.task.id, { title: 'Edited' }),
    },
    {
      method: 'TaskService.updateStatus',
      target: (f) => f.task.id,
      run: (f) => tasks.updateStatus(f.task.id, TaskStatus.IN_PROGRESS),
    },
    {
      method: 'TaskService.updateProject',
      target: (f) => f.task.id,
      run: (f) => tasks.updateProject(f.task.id, f.project.id),
    },
    {
      method: 'TaskService.promoteSubtask',
      target: (f) => f.subtask.id,
      run: (f) => tasks.promoteSubtask(f.subtask.id),
    },
    {
      method: 'TaskService.demoteTask (task)',
      target: (f) => f.task.id,
      run: (f) => tasks.demoteTask(f.task.id, f.other.id),
    },
    {
      method: 'TaskService.demoteTask (new parent)',
      target: (f) => f.task.id,
      run: (f) => tasks.demoteTask(f.other.id, f.task.id),
    },
    {
      method: 'TaskService.createSubtask (parent)',
      target: (f) => f.task.id,
      run: (f) => tasks.createSubtask(f.task.id, { title: 'Child' }),
    },
    {
      method: 'ArchiveService.archiveTask',
      target: (f) => f.task.id,
      run: (f) => archive.archiveTask(f.task.id),
    },
    {
      method: 'ProjectService.updateProject',
      target: (f) => f.project.id,
      run: (f) => projects.updateProject(f.project.id, { title: 'Edited' }),
    },
    {
      method: 'ProjectService.updateStatus',
      target: (f) => f.project.id,
      run: (f) => projects.updateStatus(f.project.id, ProjectStatus.ACTIVE),
    },
    {
      method: 'ArchiveService.archiveProject',
      target: (f) => f.project.id,
      run: (f) => archive.archiveProject(f.project.id),
    },
    {
      method: 'EventService.updateEvent',
      target: (f) => f.event.id,
      run: (f) => events.updateEvent(f.event.id, { title: 'Edited' }),
    },
    {
      method: 'EventService.updateEvent (dates)',
      target: (f) => f.event.id,
      run: (f) => events.updateEvent(f.event.id, { endAt: new Date(NEXT_WEEK.getTime() + 1) }),
    },
    {
      method: 'EventService.deleteEvent',
      target: (f) => f.event.id,
      run: (f) => events.deleteEvent(f.event.id),
    },
  ];

  it.each(cases)('$method throws on a synced row', async ({ target, run }) => {
    await link(target(f));
    // `run` may be sync (ArchiveService) or async; the async wrapper turns both into a promise
    await expect((async () => run(f))()).rejects.toThrow(ExternalReadOnlyError);
  });

  it.each(cases)('$method succeeds once the row is detached', async ({ target, run }) => {
    await link(target(f));
    await setState(target(f), LinkState.DETACHED);
    await run(f);
  });

  it.each(cases)('$method succeeds on a removed row', async ({ target, run }) => {
    await link(target(f), LinkState.REMOVED);
    await run(f);
  });

  it('leaves a synced row untouched when a write is rejected', async () => {
    await link(f.task.id);
    await expect(tasks.updateTask(f.task.id, { title: 'Edited' })).rejects.toThrow(
      ExternalReadOnlyError,
    );
    await expect(archive.archiveTask(f.task.id)).rejects.toThrow(ExternalReadOnlyError);

    const task = await tasks.getById(f.task.id);
    expect(task.title).toBe('Task');
    expect(task.archivedAt).toBeNull();
  });

  it('restores a synced task, which SyncWriter relies on', async () => {
    await archive.archiveTask(f.task.id);
    await link(f.task.id);
    expect((await archive.restoreTask(f.task.id)).archivedAt).toBeNull();
  });
});

describe('read-only guards — assertEditable', () => {
  it('throws only for a synced link', async () => {
    const synced = await tasks.createTask({ title: 'Synced', dueDate: TOMORROW });
    const detached = await tasks.createTask({ title: 'Detached', dueDate: TOMORROW });
    const local = await tasks.createTask({ title: 'Local', dueDate: TOMORROW });
    await link(synced.id);
    await link(detached.id, LinkState.DETACHED);

    await expect(assertEditable(db, synced.id)).rejects.toThrow(ExternalReadOnlyError);
    await expect(assertEditable(db, detached.id)).resolves.toBeUndefined();
    await expect(assertEditable(db, local.id)).resolves.toBeUndefined();
  });

  it('passes an id with no row, leaving not-found to the caller', async () => {
    const missing = generateId('task');
    await expect(assertEditable(db, missing)).resolves.toBeUndefined();
    await expect(tasks.updateTask(missing, { title: 'Edited' })).resolves.toBeNull();
  });
});

describe('read-only guards — local tasks in mirrored projects', () => {
  let mirrored: Project;

  beforeEach(async () => {
    mirrored = await projects.createProject({ title: 'Mirrored', dueDate: TOMORROW });
    await link(mirrored.id);
  });

  it('creates a local task in a mirrored project and counts it in the stats', async () => {
    const task = await tasks.createTask({
      title: 'Local',
      dueDate: TOMORROW,
      projectId: mirrored.id,
    });
    expect(task.projectId).toBe(mirrored.id);

    const stats = await projects.getProjectStats(mirrored.id);
    expect(stats.totalTasks).toBe(1);
    expect(stats.numOfNotStarted).toBe(1);
  });

  it('moves a local task into a mirrored project, and it stays editable there', async () => {
    const task = await tasks.createTask({ title: 'Local', dueDate: TOMORROW });
    const moved = await tasks.updateProject(task.id, mirrored.id);
    expect(moved.projectId).toBe(mirrored.id);

    await tasks.updateStatus(task.id, TaskStatus.COMPLETED);
    const stats = await projects.getProjectStats(mirrored.id);
    expect(stats.numOfCompleted).toBe(1);
    expect(stats.totalTasks).toBe(1);
  });

  it('still rejects moving a synced task, even into a mirrored project', async () => {
    const task = await tasks.createTask({ title: 'Synced', dueDate: TOMORROW });
    await link(task.id);
    await expect(tasks.updateProject(task.id, mirrored.id)).rejects.toThrow(ExternalReadOnlyError);
  });
});

describe('read-only guards — links on synced rows', () => {
  it('links a note and an event to a synced task', async () => {
    const task = await tasks.createTask({ title: 'Synced', dueDate: TOMORROW });
    await link(task.id);
    const note = await notes.createNote({ title: 'Note' });
    const event = await events.createEvent({ title: 'Event', startAt: TOMORROW, endAt: NEXT_WEEK });

    expect((await tasks.updateLinks(task.id, { linkedNoteId: note.id })).linkedNoteId).toBe(
      note.id,
    );
    expect((await tasks.updateLinks(task.id, { linkedEventId: event.id })).linkedEventId).toBe(
      event.id,
    );
  });

  it('files a note under a synced task', async () => {
    const task = await tasks.createTask({ title: 'Synced', dueDate: TOMORROW });
    await link(task.id);
    const note = await notes.createNote({ title: 'Task note', linkedTaskId: task.id });
    expect(note.linkedTaskId).toBe(task.id);
  });

  it('links a note and a task to a synced event', async () => {
    const event = await events.createEvent({ title: 'Event', startAt: TOMORROW, endAt: NEXT_WEEK });
    await link(event.id);
    const note = await notes.createNote({ title: 'Meeting notes', linkedEventId: event.id });
    expect(note.linkedEventId).toBe(event.id);

    const task = await tasks.createTask({ title: 'Follow-up', dueDate: TOMORROW });
    expect((await tasks.updateLinks(task.id, { linkedEventId: event.id })).linkedEventId).toBe(
      event.id,
    );
  });

  it('lets a synced subtask carry its own links', async () => {
    const parent = await tasks.createTask({ title: 'Parent', dueDate: TOMORROW });
    const child = await insertChild(parent.id, 'Child');
    await link(parent.id);
    await link(child);
    const note = await notes.createNote({ title: 'Note' });

    const updated = await tasks.updateLinks(child, { linkedNoteId: note.id });
    expect(updated.linkedNoteId).toBe(note.id);
  });

  it('still makes local and detached subtasks inherit links', async () => {
    const parent = await tasks.createTask({ title: 'Parent', dueDate: TOMORROW });
    const local = await tasks.createSubtask(parent.id, { title: 'Local' });
    const detached = await insertChild(parent.id, 'Detached');
    await link(detached, LinkState.DETACHED);
    const note = await notes.createNote({ title: 'Note' });

    await expect(tasks.updateLinks(local.id, { linkedNoteId: note.id })).rejects.toThrow(
      'Subtasks inherit link context',
    );
    await expect(tasks.updateLinks(detached, { linkedNoteId: note.id })).rejects.toThrow(
      'Subtasks inherit link context',
    );
  });
});

describe('read-only guards — deep external trees', () => {
  let root: TaskId;
  let child: TaskId;
  let grandchild: TaskId;

  beforeEach(async () => {
    // three levels, which local tasks cannot reach
    root = (await tasks.createTask({ title: 'Root', dueDate: TOMORROW })).id;
    child = await insertChild(root, 'Child');
    grandchild = await insertChild(child, 'Grandchild');
    for (const id of [root, child, grandchild]) await link(id);
  });

  it('reads every level', async () => {
    expect((await tasks.getById(grandchild)).parentTaskId).toBe(child);
    expect((await tasks.listSubtasks(child)).items.map((t) => t.id)).toEqual([grandchild]);
    expect((await tasks.getByIds([root, child, grandchild])).map((t) => t.external?.state)).toEqual(
      [LinkState.SYNCED, LinkState.SYNCED, LinkState.SYNCED],
    );
  });

  it('links a note to the deepest level', async () => {
    const note = await notes.createNote({ title: 'Note' });
    expect((await tasks.updateLinks(grandchild, { linkedNoteId: note.id })).linkedNoteId).toBe(
      note.id,
    );
  });

  it('rejects writes as read-only, not as too deep', async () => {
    await expect(tasks.createSubtask(child, { title: 'Too deep' })).rejects.toThrow(
      ExternalReadOnlyError,
    );
    await expect(tasks.demoteTask(child, root)).rejects.toThrow(ExternalReadOnlyError);
  });
});
