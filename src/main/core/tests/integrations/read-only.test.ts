import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { EventId, ExternalSourceId, generateId, ProjectId, TaskId } from '@common/ids';
import { integrations, externalSources, externalLinks } from '@main/db/schema/integrations';
import { tasks as tasksTable } from '@main/db/schema/tasks';
import { projects as projectsTable } from '@main/db/schema/projects';
import { eq, or } from 'drizzle-orm';
import { createDb } from '../utils';
import { TaskService } from '../../tasks/service';
import { ProjectService } from '../../projects/service';
import { EventService } from '../../events/service';
import { ArchiveService } from '../../archive/service';
import { NoteService } from '../../notes/service';
import {
  AuthType,
  Event,
  LinkState,
  Project,
  ProjectStatus,
  Provider,
  SourceType,
  Task,
  TaskStatus,
} from '@common/types';
import { assertEditable, assertNotSynced } from '../../integrations/refs';
import { ExternalReadOnlyError, NotFoundError } from '../../shared/errors';

// Read-only guards on synced rows, and local tasks in mirrored projects. Nothing writes links yet
// (SyncWriter does, later), so these tests insert link rows directly.

const TOMORROW = new Date(Date.now() + 86_400_000);
const NEXT_WEEK = new Date(Date.now() + 7 * 86_400_000);
const SYNCED_AT = new Date('2026-10-01T12:00:00Z');

let db: BetterSQLite3Database;
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

function link(id: LinkedId, state: LinkState = LinkState.SYNCED) {
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
      state,
      ...entityColumn(id),
    })
    .run();
}

// what detach (feature 12) will do to the link
function setState(id: LinkedId, state: LinkState) {
  // entity ids carry a per-type prefix, so at most one of these columns can match
  db.update(externalLinks)
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
function insertChild(parentTaskId: TaskId, title: string): TaskId {
  return db
    .insert(tasksTable)
    .values({ title, dueDate: TOMORROW, parentTaskId, status: TaskStatus.NOT_STARTED })
    .returning()
    .get().id;
}

beforeEach(async () => {
  db = createDb();
  tasks = new TaskService(db);
  projects = new ProjectService(db, new TaskService(db));
  events = new EventService(db);
  archive = new ArchiveService(db);
  workspacePath = await fs.mkdtemp(path.join(os.tmpdir(), 'devbrain-read-only-'));
  notes = new NoteService(db, workspacePath);
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
    const parent = tasks.createTask({ title: 'Parent', dueDate: TOMORROW });
    f = {
      task: tasks.createTask({ title: 'Task', dueDate: TOMORROW }),
      other: tasks.createTask({ title: 'Other', dueDate: TOMORROW }),
      subtask: tasks.createSubtask(parent.id, { title: 'Subtask' }),
      project: projects.createProject({ title: 'Project', dueDate: TOMORROW }),
      event: events.createEvent({ title: 'Event', startAt: TOMORROW, endAt: NEXT_WEEK }),
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
      method: 'TaskService.updateTask (clearing a field)',
      target: (f) => f.task.id,
      run: (f) => tasks.updateTask(f.task.id, { dueDate: null }),
    },
    {
      method: 'TaskService.updateTasks',
      target: (f) => f.task.id,
      run: (f) => tasks.updateTasks([f.other.id, f.task.id], { dueDate: null }),
    },
    {
      method: 'ArchiveService.archiveTask',
      target: (f) => f.task.id,
      run: (f) => archive.archiveTask(f.task.id),
    },
    {
      method: 'ArchiveService.archiveTasks',
      target: (f) => f.task.id,
      run: (f) => archive.archiveTasks([f.other.id, f.task.id]),
    },
    {
      method: 'ProjectService.updateProject',
      target: (f) => f.project.id,
      run: (f) => projects.updateProject(f.project.id, { title: 'Edited' }),
    },
    {
      method: 'ProjectService.updateProject (clearing a field)',
      target: (f) => f.project.id,
      run: (f) => projects.updateProject(f.project.id, { dueDate: null }),
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
    link(target(f));
    // `run` may be sync (ArchiveService) or async; the async wrapper turns both into a promise
    await expect((async () => run(f))()).rejects.toThrow(ExternalReadOnlyError);
  });

  it.each(cases)('$method succeeds once the row is detached', async ({ target, run }) => {
    link(target(f));
    setState(target(f), LinkState.DETACHED);
    await run(f);
  });

  // a removed task or project is in the trash, a removed event hidden: read-only, but deletable
  const deletes = cases.filter((c) => c.method.includes('delete'));
  const edits = cases.filter((c) => !c.method.includes('delete'));

  it.each(edits)('$method throws on a removed row', async ({ target, run }) => {
    link(target(f), LinkState.REMOVED);
    await expect((async () => run(f))()).rejects.toThrow(ExternalReadOnlyError);
  });

  it.each(deletes)('$method succeeds on a removed row', async ({ target, run }) => {
    link(target(f), LinkState.REMOVED);
    await run(f);
  });

  it('leaves a synced row untouched when a write is rejected', async () => {
    link(f.task.id);
    expect(() => tasks.updateTask(f.task.id, { title: 'Edited' })).toThrow(ExternalReadOnlyError);
    expect(() => archive.archiveTask(f.task.id)).toThrow(ExternalReadOnlyError);

    const task = tasks.getById(f.task.id);
    expect(task.title).toBe('Task');
    expect(task.archivedAt).toBeNull();
  });

  it('refuses a whole batch that holds a synced task, changing none of it', async () => {
    link(f.task.id);
    expect(() => tasks.updateTasks([f.other.id, f.task.id], { dueDate: null })).toThrow(
      ExternalReadOnlyError,
    );
    expect(() => archive.archiveTasks([f.other.id, f.task.id])).toThrow(ExternalReadOnlyError);

    expect(tasks.getByIds([f.other.id, f.task.id]).map((t) => [t.dueDate, t.archivedAt])).toEqual([
      [TOMORROW, null],
      [TOMORROW, null],
    ]);
  });

  it('restores a synced task, which SyncWriter relies on', async () => {
    archive.archiveTask(f.task.id);
    link(f.task.id);
    expect(archive.restoreTask(f.task.id).archivedAt).toBeNull();
  });
});

describe('restoring a row its provider removed', () => {
  // the link's state, read straight from the table
  function stateOf(id: TaskId | ProjectId): LinkState | undefined {
    return db
      .select({ state: externalLinks.state })
      .from(externalLinks)
      .where(
        id.startsWith('tsk_')
          ? eq(externalLinks.taskId, id as TaskId)
          : eq(externalLinks.projectId, id as ProjectId),
      )
      .get()?.state;
  }

  // a task sync moved to the trash, as it does for an issue deleted in Linear
  function removedTask(title: string, parentTaskId?: TaskId): TaskId {
    const id = parentTaskId
      ? insertChild(parentTaskId, title)
      : tasks.createTask({ title, dueDate: TOMORROW }).id;
    link(id, LinkState.REMOVED);
    db.update(tasksTable).set({ archivedAt: SYNCED_AT }).where(eq(tasksTable.id, id)).run();
    return id;
  }

  it('detaches a restored task and its removed subtasks, so sync leaves them alone', () => {
    const parent = removedTask('Gone in Linear');
    const child = removedTask('Its subtask', parent);
    const restored = archive.restoreTask(parent);
    expect(restored.archivedAt).toBeNull();
    expect(restored.external?.state).toBe(LinkState.DETACHED);
    expect(stateOf(parent)).toBe(LinkState.DETACHED);
    expect(stateOf(child)).toBe(LinkState.DETACHED);
    expect(
      db.select().from(externalLinks).where(eq(externalLinks.taskId, parent)).get()?.removedAt,
    ).toBeNull();
    // the user's own copy now: editable
    expect(tasks.updateTask(parent, { title: 'Mine now' }).title).toBe('Mine now');
  });

  it('leaves a sub-issue sync trashed before its detached parent in the trash, still removed', () => {
    const parent = tasks.createTask({ title: 'Detached parent', dueDate: TOMORROW });
    link(parent.id, LinkState.DETACHED);
    // a sub-issue Linear archived earlier: sync moved it to the trash on its own
    const child = removedTask('Archived sub-issue', parent.id);
    archive.archiveTask(parent.id);
    expect(archive.restoreTask(parent.id).archivedAt).toBeNull();
    expect(tasks.getById(child, { includeArchived: true }).archivedAt).not.toBeNull();
    expect(stateOf(child)).toBe(LinkState.REMOVED);
  });

  it('leaves a restored local task without a link', () => {
    const task = tasks.createTask({ title: 'Local', dueDate: TOMORROW });
    archive.archiveTask(task.id);
    expect(archive.restoreTask(task.id).external).toBeNull();
  });

  it('detaches a restored project, and leaves the removed tasks sync trashed before it', () => {
    const project = projects.createProject({ title: 'Retired in Linear' });
    link(project.id, LinkState.REMOVED);
    // an issue deleted in Linear earlier: sync moved it to the trash on its own
    const task = removedTask('Its issue');
    db.update(tasksTable).set({ projectId: project.id }).where(eq(tasksTable.id, task)).run();
    const mine = tasks.createTask({ title: 'Mine', dueDate: TOMORROW, projectId: project.id });
    // sync moves a removed project to the trash, with what is in it, at one time
    const retiredAt = new Date();
    db.update(projectsTable)
      .set({ archivedAt: retiredAt })
      .where(eq(projectsTable.id, project.id))
      .run();
    db.update(tasksTable).set({ archivedAt: retiredAt }).where(eq(tasksTable.id, mine.id)).run();
    expect(archive.restoreProject(project.id).external?.state).toBe(LinkState.DETACHED);
    expect(tasks.getById(mine.id).archivedAt).toBeNull();
    // still in the trash and still removed: only restoring it, which asks, detaches it
    expect(tasks.getById(task, { includeArchived: true }).archivedAt).not.toBeNull();
    expect(stateOf(task)).toBe(LinkState.REMOVED);
  });

  it('detaches the removed rows a batch restore brings back, and only those', () => {
    const removed = removedTask('Gone in Linear');
    const detached = tasks.createTask({ title: 'Detached', dueDate: TOMORROW });
    link(detached.id, LinkState.DETACHED);
    archive.archiveTask(detached.id);
    archive.restoreMany({ taskIds: [removed, detached.id], projectIds: [], noteIds: [] });
    expect(stateOf(removed)).toBe(LinkState.DETACHED);
    expect(stateOf(detached.id)).toBe(LinkState.DETACHED);
  });
});

describe('read-only guards — assertEditable', () => {
  it('throws for a synced or removed link, and assertNotSynced only for a synced one', async () => {
    const synced = tasks.createTask({ title: 'Synced', dueDate: TOMORROW });
    const removed = tasks.createTask({ title: 'Removed', dueDate: TOMORROW });
    const detached = tasks.createTask({ title: 'Detached', dueDate: TOMORROW });
    const local = tasks.createTask({ title: 'Local', dueDate: TOMORROW });
    link(synced.id);
    link(removed.id, LinkState.REMOVED);
    link(detached.id, LinkState.DETACHED);

    expect(() => assertEditable(db, synced.id)).toThrow(ExternalReadOnlyError);
    expect(() => assertEditable(db, removed.id)).toThrow(ExternalReadOnlyError);
    expect(() => assertEditable(db, detached.id)).not.toThrow();
    expect(() => assertEditable(db, local.id)).not.toThrow();
    expect(() => assertNotSynced(db, synced.id)).toThrow(ExternalReadOnlyError);
    expect(() => assertNotSynced(db, removed.id)).not.toThrow();
    expect(() => assertNotSynced(db, detached.id)).not.toThrow();
  });

  it('passes an id with no row, leaving not-found to the caller', async () => {
    const missing = generateId('task');
    expect(() => assertEditable(db, missing)).not.toThrow();
    expect(() => tasks.updateTask(missing, { title: 'Edited' })).toThrow(NotFoundError);
  });
});

describe('read-only guards — local tasks in mirrored projects', () => {
  let mirrored: Project;

  beforeEach(async () => {
    mirrored = projects.createProject({ title: 'Mirrored', dueDate: TOMORROW });
    link(mirrored.id);
  });

  it('creates a local task in a mirrored project and counts it in the stats', async () => {
    const task = tasks.createTask({
      title: 'Local',
      dueDate: TOMORROW,
      projectId: mirrored.id,
    });
    expect(task.projectId).toBe(mirrored.id);

    const stats = projects.getProjectStats(mirrored.id);
    expect(stats.totalTasks).toBe(1);
    expect(stats.numOfNotStarted).toBe(1);
  });

  it('moves a local task into a mirrored project, and it stays editable there', async () => {
    const task = tasks.createTask({ title: 'Local', dueDate: TOMORROW });
    const moved = tasks.updateProject(task.id, mirrored.id);
    expect(moved.projectId).toBe(mirrored.id);

    tasks.updateStatus(task.id, TaskStatus.COMPLETED);
    const stats = projects.getProjectStats(mirrored.id);
    expect(stats.numOfCompleted).toBe(1);
    expect(stats.totalTasks).toBe(1);
  });

  it('still rejects moving a synced task, even into a mirrored project', async () => {
    const task = tasks.createTask({ title: 'Synced', dueDate: TOMORROW });
    link(task.id);
    expect(() => tasks.updateProject(task.id, mirrored.id)).toThrow(ExternalReadOnlyError);
  });
});

describe('read-only guards — links on synced rows', () => {
  it('links a note and an event to a synced task', async () => {
    const task = tasks.createTask({ title: 'Synced', dueDate: TOMORROW });
    link(task.id);
    const note = await notes.createNote({ title: 'Note' });
    const event = events.createEvent({ title: 'Event', startAt: TOMORROW, endAt: NEXT_WEEK });

    expect(tasks.updateLinks(task.id, { linkedNoteId: note.id }).linkedNoteId).toBe(note.id);
    expect(tasks.updateLinks(task.id, { linkedEventId: event.id }).linkedEventId).toBe(event.id);
  });

  it('files a note under a synced task', async () => {
    const task = tasks.createTask({ title: 'Synced', dueDate: TOMORROW });
    link(task.id);
    const note = await notes.createNote({ title: 'Task note', linkedTaskId: task.id });
    expect(note.linkedTaskId).toBe(task.id);
  });

  it('links a note and a task to a synced event', async () => {
    const event = events.createEvent({ title: 'Event', startAt: TOMORROW, endAt: NEXT_WEEK });
    link(event.id);
    const note = await notes.createNote({ title: 'Meeting notes', linkedEventId: event.id });
    expect(note.linkedEventId).toBe(event.id);

    const task = tasks.createTask({ title: 'Follow-up', dueDate: TOMORROW });
    expect(tasks.updateLinks(task.id, { linkedEventId: event.id }).linkedEventId).toBe(event.id);
  });

  it('lets a synced subtask carry its own links', async () => {
    const parent = tasks.createTask({ title: 'Parent', dueDate: TOMORROW });
    const child = insertChild(parent.id, 'Child');
    link(parent.id);
    link(child);
    const note = await notes.createNote({ title: 'Note' });

    const updated = tasks.updateLinks(child, { linkedNoteId: note.id });
    expect(updated.linkedNoteId).toBe(note.id);
  });

  it('still makes local and detached subtasks inherit links', async () => {
    const parent = tasks.createTask({ title: 'Parent', dueDate: TOMORROW });
    const local = tasks.createSubtask(parent.id, { title: 'Local' });
    const detached = insertChild(parent.id, 'Detached');
    link(detached, LinkState.DETACHED);
    const note = await notes.createNote({ title: 'Note' });

    expect(() => tasks.updateLinks(local.id, { linkedNoteId: note.id })).toThrow(
      'Subtasks inherit link context',
    );
    expect(() => tasks.updateLinks(detached, { linkedNoteId: note.id })).toThrow(
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
    root = tasks.createTask({ title: 'Root', dueDate: TOMORROW }).id;
    child = insertChild(root, 'Child');
    grandchild = insertChild(child, 'Grandchild');
    for (const id of [root, child, grandchild]) link(id);
  });

  it('reads every level', async () => {
    expect(tasks.getById(grandchild).parentTaskId).toBe(child);
    expect(tasks.listSubtasks(child).items.map((t) => t.id)).toEqual([grandchild]);
    expect(tasks.getByIds([root, child, grandchild]).map((t) => t.external?.state)).toEqual([
      LinkState.SYNCED,
      LinkState.SYNCED,
      LinkState.SYNCED,
    ]);
  });

  it('links a note to the deepest level', async () => {
    const note = await notes.createNote({ title: 'Note' });
    expect(tasks.updateLinks(grandchild, { linkedNoteId: note.id }).linkedNoteId).toBe(note.id);
  });

  it('rejects writes as read-only, not as too deep', async () => {
    expect(() => tasks.createSubtask(child, { title: 'Too deep' })).toThrow(ExternalReadOnlyError);
    expect(() => tasks.demoteTask(child, root)).toThrow(ExternalReadOnlyError);
  });
});
