import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import Database from 'better-sqlite3';
import { createDb } from '../utils';
import { ArchiveChange, ArchiveService } from '../../archive/service';
import { NoteService } from '../../notes/service';
import { ProjectService } from '../../projects/service';
import { TaskService } from '../../tasks/service';
import { InvalidCursorError } from '../../shared/pagination';

const TOMORROW = new Date(Date.now() + 24 * 60 * 60 * 1000);

let db: BetterSQLite3Database;
let archive: ArchiveService;
let tasks: TaskService;
let projects: ProjectService;
let notesService: NoteService;
let workspacePath: string;

beforeEach(async () => {
  db = createDb();
  workspacePath = await fs.mkdtemp(path.join(os.tmpdir(), 'devbrain-archive-'));
  await fs.mkdir(path.join(workspacePath, 'notes'), { recursive: true });

  archive = new ArchiveService(db);
  tasks = new TaskService(db);
  projects = new ProjectService(db);
  notesService = new NoteService(db, workspacePath);
});

afterEach(async () => {
  await fs.rm(workspacePath, { recursive: true, force: true });
});

// whether the database connection is inside a transaction now; createDb's type leaves out $client
function inTransaction(): boolean {
  return (db as typeof db & { $client: Database.Database }).$client.inTransaction;
}

describe('ArchiveService — onChange', () => {
  // every change sent, with whether it was sent inside the archive's transaction
  function record() {
    const changes: (ArchiveChange & { inTransaction: boolean })[] = [];
    archive.onChange((change) => changes.push({ ...change, inTransaction: inTransaction() }));
    return changes;
  }

  // a task with a subtask, a note on each, and a note on an unrelated task
  async function taskTree() {
    const task = await tasks.createTask({ title: 'Parent', dueDate: TOMORROW });
    const subtask = await tasks.createSubtask(task.id, { title: 'Child', dueDate: TOMORROW });
    const taskNote = await notesService.createNote({ title: 'On parent', linkedTaskId: task.id });
    const subtaskNote = await notesService.createNote({
      title: 'On child',
      linkedTaskId: subtask.id,
    });
    const other = await tasks.createTask({ title: 'Other', dueDate: TOMORROW });
    await notesService.createNote({ title: 'On other', linkedTaskId: other.id });
    return { task, subtask, taskNote, subtaskNote };
  }

  it('archiving and restoring a task sends its whole subtree and their notes', async () => {
    const { task, subtask, taskNote, subtaskNote } = await taskTree();
    const changes = record();

    archive.archiveTask(task.id);
    archive.restoreTask(task.id);

    const touched = {
      taskIds: expect.arrayContaining([task.id, subtask.id]),
      projectIds: [],
      noteIds: expect.arrayContaining([taskNote.id, subtaskNote.id]),
      inTransaction: true,
    };
    expect(changes).toEqual([
      { type: 'archived', ...touched },
      { type: 'restored', ...touched },
    ]);
    expect(changes.map((c) => [c.taskIds.length, c.noteIds.length])).toEqual([
      [2, 2],
      [2, 2],
    ]);
  });

  it('archiving and restoring a project sends its tasks and notes', async () => {
    const project = await projects.createProject({ title: 'Apollo', dueDate: TOMORROW });
    const task = await tasks.createTask({
      title: 'In project',
      dueDate: TOMORROW,
      projectId: project.id,
    });
    const subtask = await tasks.createSubtask(task.id, { title: 'Child', dueDate: TOMORROW });
    const projectNote = await notesService.createNote({ title: 'Plan', projectId: project.id });
    const taskNote = await notesService.createNote({ title: 'Log', linkedTaskId: subtask.id });
    await tasks.createTask({ title: 'Elsewhere', dueDate: TOMORROW });
    const changes = record();

    archive.archiveProject(project.id);
    archive.restoreProject(project.id);

    const touched = {
      taskIds: expect.arrayContaining([task.id, subtask.id]),
      projectIds: [project.id],
      noteIds: expect.arrayContaining([projectNote.id, taskNote.id]),
      inTransaction: true,
    };
    expect(changes).toEqual([
      { type: 'archived', ...touched },
      { type: 'restored', ...touched },
    ]);
    expect(changes.map((c) => [c.taskIds.length, c.noteIds.length])).toEqual([
      [2, 2],
      [2, 2],
    ]);
  });

  it('archiving and restoring a note sends only the note', async () => {
    const note = await notesService.createNote({ title: 'Minutes' });
    const changes = record();

    archive.archiveNote(note.id);
    archive.restoreNote(note.id);

    const touched = { taskIds: [], projectIds: [], noteIds: [note.id], inTransaction: true };
    expect(changes).toEqual([
      { type: 'archived', ...touched },
      { type: 'restored', ...touched },
    ]);
  });

  it('sends nothing when the archive or restore is refused', async () => {
    const task = await tasks.createTask({ title: 'Active', dueDate: TOMORROW });
    const changes = record();

    expect(() => archive.restoreTask(task.id)).toThrow();
    archive.archiveTask(task.id);
    expect(() => archive.archiveTask(task.id)).toThrow();

    expect(changes.map((c) => c.type)).toEqual(['archived']);
  });

  it('a listener that throws fails neither the archive nor the other listeners', async () => {
    const task = await tasks.createTask({ title: 'Active', dueDate: TOMORROW });
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    archive.onChange(() => {
      throw new Error('listener failed');
    });
    const changes = record();

    try {
      expect(archive.archiveTask(task.id).archivedAt).not.toBeNull();
    } finally {
      error.mockRestore();
    }
    expect(changes).toHaveLength(1);
    expect(archive.listArchived().items.map((e) => e.id)).toEqual([task.id]);
  });

  it('stops sending to a listener once it unsubscribes', async () => {
    const note = await notesService.createNote({ title: 'Minutes' });
    const listener = vi.fn();
    const unsubscribe = archive.onChange(listener);

    archive.archiveNote(note.id);
    unsubscribe();
    archive.restoreNote(note.id);

    expect(listener).toHaveBeenCalledOnce();
  });
});

describe('ArchiveService — listArchived', () => {
  it('returns an empty list when nothing is archived', async () => {
    await tasks.createTask({ title: 'Active', dueDate: TOMORROW });
    await projects.createProject({ title: 'Active', dueDate: TOMORROW });
    await notesService.createNote({ title: 'Active' });

    expect(archive.listArchived().items).toEqual([]);
  });

  it('returns archived tasks, projects and notes in one list', async () => {
    const task = await tasks.createTask({ title: 'Archived task', dueDate: TOMORROW });
    const project = await projects.createProject({
      title: 'Archived project',
      dueDate: TOMORROW,
    });
    const note = await notesService.createNote({ title: 'Archived note' });

    archive.archiveTask(task.id);
    archive.archiveProject(project.id);
    archive.archiveNote(note.id);

    const result = archive.listArchived().items;
    expect(result).toHaveLength(3);
    expect(result.map((entity) => entity.id).sort()).toEqual([task.id, project.id, note.id].sort());
  });

  it('tags each row with its entity type', async () => {
    const task = await tasks.createTask({ title: 'T', dueDate: TOMORROW });
    const project = await projects.createProject({ title: 'P', dueDate: TOMORROW });
    const note = await notesService.createNote({ title: 'N' });

    archive.archiveTask(task.id);
    archive.archiveProject(project.id);
    archive.archiveNote(note.id);

    const byId = new Map(archive.listArchived().items.map((entity) => [entity.id, entity]));
    expect(byId.get(task.id)?.entityType).toBe('tasks');
    expect(byId.get(project.id)?.entityType).toBe('projects');
    expect(byId.get(note.id)?.entityType).toBe('notes');
  });

  it('carries the title of each archived entity', async () => {
    const task = await tasks.createTask({ title: 'My task title', dueDate: TOMORROW });
    archive.archiveTask(task.id);

    const [entity] = archive.listArchived().items;
    expect(entity.title).toBe('My task title');
  });

  it('decodes archivedAt as a Date', async () => {
    const task = await tasks.createTask({ title: 'T', dueDate: TOMORROW });
    const archived = archive.archiveTask(task.id);

    const [entity] = archive.listArchived().items;
    expect(entity.archivedAt).toBeInstanceOf(Date);
    expect(entity.archivedAt.getTime()).toBe(archived.archivedAt!.getTime());
  });

  it('sorts most recently archived first, across entity types', async () => {
    const project = await projects.createProject({ title: 'First', dueDate: TOMORROW });
    const task = await tasks.createTask({ title: 'Second', dueDate: TOMORROW });
    const note = await notesService.createNote({ title: 'Third' });

    // archivedAt is stamped with Date.now() at archive time, so the writes have
    // to be spread out to produce a deterministic order
    archive.archiveProject(project.id);
    await new Promise((resolve) => setTimeout(resolve, 5));
    archive.archiveTask(task.id);
    await new Promise((resolve) => setTimeout(resolve, 5));
    archive.archiveNote(note.id);

    const result = archive.listArchived().items;
    expect(result.map((entity) => entity.id)).toEqual([note.id, task.id, project.id]);
  });

  it('excludes entities that have been restored', async () => {
    const task = await tasks.createTask({ title: 'Restored', dueDate: TOMORROW });
    const stillArchived = await tasks.createTask({ title: 'Still archived', dueDate: TOMORROW });

    archive.archiveTask(task.id);
    archive.archiveTask(stillArchived.id);
    archive.restoreTask(task.id);

    expect(archive.listArchived().items.map((entity) => entity.id)).toEqual([stillArchived.id]);
  });

  it('lists cascade-archived children alongside the entity that triggered them', async () => {
    const project = await projects.createProject({ title: 'Parent project', dueDate: TOMORROW });
    const task = await tasks.createTask({
      title: 'Task in project',
      dueDate: TOMORROW,
      projectId: project.id,
    });
    const note = await notesService.createNote({ title: 'Task note', linkedTaskId: task.id });

    archive.archiveProject(project.id);

    const ids = archive.listArchived().items.map((entity) => entity.id);
    expect(ids).toHaveLength(3);
    expect(ids).toContain(project.id);
    expect(ids).toContain(task.id);
    expect(ids).toContain(note.id);
  });
});

describe('ArchiveService — listArchived cursor pagination', () => {
  function collect(limit: number) {
    const ids: string[] = [];
    let cursor: string | undefined;
    do {
      const page = archive.listArchived({}, { limit, cursor });
      expect(page.items.length).toBeLessThanOrEqual(limit);
      ids.push(...page.items.map((entity) => entity.id));
      cursor = page.nextCursor ?? undefined;
    } while (cursor);
    return ids;
  }

  it('returns a null nextCursor when everything fits', async () => {
    const task = await tasks.createTask({ title: 'T', dueDate: TOMORROW });
    archive.archiveTask(task.id);

    const page = archive.listArchived();
    expect(page.items).toHaveLength(1);
    expect(page.nextCursor).toBeNull();
  });

  it('paginated order matches unpaginated order, across entity types and tied archivedAt', async () => {
    // each project cascade stamps the project, its task and the task's note with
    // the same archivedAt, so pages have to break ties on id across all three tables
    for (let i = 0; i < 3; i++) {
      const project = await projects.createProject({ title: `P${i}`, dueDate: TOMORROW });
      const task = await tasks.createTask({
        title: `T${i}`,
        dueDate: TOMORROW,
        projectId: project.id,
      });
      await notesService.createNote({ title: `N${i}`, linkedTaskId: task.id });
      archive.archiveProject(project.id);
      await new Promise((resolve) => setTimeout(resolve, 2));
    }
    const looseNote = await notesService.createNote({ title: 'Loose' });
    archive.archiveNote(looseNote.id);

    const full = archive.listArchived({}, { limit: 200 }).items.map((entity) => entity.id);
    expect(full).toHaveLength(10);
    expect(new Set(full).size).toBe(10);
    for (const limit of [1, 2, 3, 4]) {
      expect(collect(limit)).toEqual(full);
    }
  });

  it('rejects an invalid limit, a garbage cursor and a cursor from another list', async () => {
    const a = await notesService.createNote({ title: 'a' });
    const b = await notesService.createNote({ title: 'b' });
    archive.archiveNote(a.id);
    archive.archiveNote(b.id);

    expect(() => archive.listArchived({}, { limit: 0 })).toThrow(RangeError);
    expect(() => archive.listArchived({}, { cursor: '!!' })).toThrow(InvalidCursorError);

    // a cursor from a different list (here the active-notes list) is rejected
    await notesService.createNote({ title: 'c' });
    await notesService.createNote({ title: 'd' });
    const otherCursor = (await notesService.listNotes({}, { sortBy: 'title' }, { limit: 1 }))
      .nextCursor!;
    expect(() => archive.listArchived({}, { cursor: otherCursor })).toThrow(InvalidCursorError);
  });
});

describe('ArchiveService — listArchived entity type filter', () => {
  // two of each entity type, archived in a known order (oldest first)
  async function seed() {
    const created: { id: string; entityType: 'tasks' | 'projects' | 'notes' }[] = [];
    for (let i = 0; i < 2; i++) {
      const task = await tasks.createTask({ title: `T${i}`, dueDate: TOMORROW });
      const project = await projects.createProject({ title: `P${i}`, dueDate: TOMORROW });
      const note = await notesService.createNote({ title: `N${i}` });
      for (const [id, entityType, archiveIt] of [
        [task.id, 'tasks', () => archive.archiveTask(task.id)],
        [project.id, 'projects', () => archive.archiveProject(project.id)],
        [note.id, 'notes', () => archive.archiveNote(note.id)],
      ] as const) {
        archiveIt();
        created.push({ id, entityType });
        // archivedAt is stamped with Date.now(), so spread the writes out
        await new Promise((resolve) => setTimeout(resolve, 2));
      }
    }
    // most recently archived first, as listArchived returns them
    return created.reverse();
  }

  it("defaults to 'all', and 'all' returns every entity type", async () => {
    const created = await seed();
    const all = archive.listArchived({ entityType: 'all' }).items.map((entity) => entity.id);
    expect(all).toEqual(created.map((entity) => entity.id));
    expect(archive.listArchived().items.map((entity) => entity.id)).toEqual(all);
  });

  it.each(['tasks', 'projects', 'notes'] as const)(
    'returns only archived %s, most recently archived first',
    async (entityType) => {
      const created = await seed();
      const result = archive.listArchived({ entityType }).items;
      expect(result.every((entity) => entity.entityType === entityType)).toBe(true);
      expect(result.map((entity) => entity.id)).toEqual(
        created.filter((entity) => entity.entityType === entityType).map((entity) => entity.id),
      );
    },
  );

  it('carries the title and archivedAt for a single entity type', async () => {
    const note = await notesService.createNote({ title: 'Only note' });
    const archived = archive.archiveNote(note.id);

    const [entity] = archive.listArchived({ entityType: 'notes' }).items;
    expect(entity).toEqual({
      id: note.id,
      entityType: 'notes',
      title: 'Only note',
      archivedAt: archived.archivedAt,
    });
  });

  it('includes cascade-archived children under their own type', async () => {
    const project = await projects.createProject({ title: 'Parent', dueDate: TOMORROW });
    const task = await tasks.createTask({
      title: 'Child',
      dueDate: TOMORROW,
      projectId: project.id,
    });
    archive.archiveProject(project.id);

    expect(archive.listArchived({ entityType: 'tasks' }).items.map((e) => e.id)).toEqual([task.id]);
    expect(archive.listArchived({ entityType: 'projects' }).items.map((e) => e.id)).toEqual([
      project.id,
    ]);
  });

  it.each(['all', 'tasks', 'projects', 'notes'] as const)(
    "paginates within the '%s' filter",
    async (entityType) => {
      await seed();
      const full = archive
        .listArchived({ entityType }, { limit: 200 })
        .items.map((entity) => entity.id);

      const ids: string[] = [];
      let cursor: string | undefined;
      do {
        const page = archive.listArchived({ entityType }, { limit: 1, cursor });
        expect(page.items.length).toBeLessThanOrEqual(1);
        ids.push(...page.items.map((entity) => entity.id));
        cursor = page.nextCursor ?? undefined;
      } while (cursor);
      expect(ids).toEqual(full);
    },
  );
});
