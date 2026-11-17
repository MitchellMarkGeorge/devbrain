import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import Database from 'better-sqlite3';
import { createDb } from '../utils';
import { TrashChange, TrashService } from '../../trash/service';
import { NoteService } from '../../notes/service';
import { ProjectService } from '../../projects/service';
import { TaskService } from '../../tasks/service';
import { InvalidCursorError } from '../../shared/pagination';
import type { TaskId } from '@common/ids';
import { AlreadyInTrashError, NotFoundError } from '../../shared/errors';

const TOMORROW = new Date(Date.now() + 24 * 60 * 60 * 1000);

let db: BetterSQLite3Database;
let trash: TrashService;
let tasks: TaskService;
let projects: ProjectService;
let notesService: NoteService;
let workspacePath: string;

beforeEach(async () => {
  db = createDb();
  workspacePath = await fs.mkdtemp(path.join(os.tmpdir(), 'devbrain-trash-'));
  await fs.mkdir(path.join(workspacePath, 'notes'), { recursive: true });

  trash = new TrashService(db);
  tasks = new TaskService(db);
  projects = new ProjectService(db, new TaskService(db));
  notesService = new NoteService(db, workspacePath);
});

afterEach(async () => {
  await fs.rm(workspacePath, { recursive: true, force: true });
});

// whether the database connection is inside a transaction now; createDb's type leaves out $client
function inTransaction(): boolean {
  return (db as typeof db & { $client: Database.Database }).$client.inTransaction;
}

describe('TrashService — onChange', () => {
  // every change sent, with whether it was sent inside the trash's transaction
  function record() {
    const changes: (TrashChange & { inTransaction: boolean })[] = [];
    trash.onChange((change) => changes.push({ ...change, inTransaction: inTransaction() }));
    return changes;
  }

  // a task with a subtask, a note on each, and a note on an unrelated task
  async function taskTree() {
    const task = tasks.createTask({ title: 'Parent', dueDate: TOMORROW });
    const subtask = tasks.createSubtask(task.id, { title: 'Child', dueDate: TOMORROW });
    const taskNote = await notesService.createNote({ title: 'On parent', linkedTaskId: task.id });
    const subtaskNote = await notesService.createNote({
      title: 'On child',
      linkedTaskId: subtask.id,
    });
    const other = tasks.createTask({ title: 'Other', dueDate: TOMORROW });
    await notesService.createNote({ title: 'On other', linkedTaskId: other.id });
    return { task, subtask, taskNote, subtaskNote };
  }

  it('trashing and restoring a task sends its whole subtree and their notes', async () => {
    const { task, subtask, taskNote, subtaskNote } = await taskTree();
    const changes = record();

    trash.trashTask(task.id);
    trash.restoreTask(task.id);

    const touched = {
      taskIds: expect.arrayContaining([task.id, subtask.id]),
      projectIds: [],
      noteIds: expect.arrayContaining([taskNote.id, subtaskNote.id]),
      inTransaction: true,
    };
    expect(changes).toEqual([
      { type: 'trashed', ...touched },
      { type: 'restored', ...touched },
    ]);
    expect(changes.map((c) => [c.taskIds.length, c.noteIds.length])).toEqual([
      [2, 2],
      [2, 2],
    ]);
  });

  it('trashing and restoring a project sends its tasks and notes', async () => {
    const project = projects.createProject({ title: 'Apollo', dueDate: TOMORROW });
    const task = tasks.createTask({
      title: 'In project',
      dueDate: TOMORROW,
      projectId: project.id,
    });
    const subtask = tasks.createSubtask(task.id, { title: 'Child', dueDate: TOMORROW });
    const projectNote = await notesService.createNote({ title: 'Plan', projectId: project.id });
    const taskNote = await notesService.createNote({ title: 'Log', linkedTaskId: subtask.id });
    tasks.createTask({ title: 'Elsewhere', dueDate: TOMORROW });
    const changes = record();

    trash.trashProject(project.id);
    trash.restoreProject(project.id);

    const touched = {
      taskIds: expect.arrayContaining([task.id, subtask.id]),
      projectIds: [project.id],
      noteIds: expect.arrayContaining([projectNote.id, taskNote.id]),
      inTransaction: true,
    };
    expect(changes).toEqual([
      { type: 'trashed', ...touched },
      { type: 'restored', ...touched },
    ]);
    expect(changes.map((c) => [c.taskIds.length, c.noteIds.length])).toEqual([
      [2, 2],
      [2, 2],
    ]);
  });

  it('trashing and restoring a note sends only the note', async () => {
    const note = await notesService.createNote({ title: 'Minutes' });
    const changes = record();

    trash.trashNote(note.id);
    trash.restoreNote(note.id);

    const touched = { taskIds: [], projectIds: [], noteIds: [note.id], inTransaction: true };
    expect(changes).toEqual([
      { type: 'trashed', ...touched },
      { type: 'restored', ...touched },
    ]);
  });

  it('sends nothing when the trash or restore is refused', async () => {
    const task = tasks.createTask({ title: 'Active', dueDate: TOMORROW });
    const changes = record();

    expect(() => trash.restoreTask(task.id)).toThrow();
    trash.trashTask(task.id);
    expect(() => trash.trashTask(task.id)).toThrow();

    expect(changes.map((c) => c.type)).toEqual(['trashed']);
  });

  it('a listener that throws fails neither the trash nor the other listeners', async () => {
    const task = tasks.createTask({ title: 'Active', dueDate: TOMORROW });
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    trash.onChange(() => {
      throw new Error('listener failed');
    });
    const changes = record();

    try {
      expect(trash.trashTask(task.id).trashedAt).not.toBeNull();
    } finally {
      error.mockRestore();
    }
    expect(changes).toHaveLength(1);
    expect(trash.listTrashed().items.map((e) => e.id)).toEqual([task.id]);
  });

  it('stops sending to a listener once it unsubscribes', async () => {
    const note = await notesService.createNote({ title: 'Minutes' });
    const listener = vi.fn();
    const unsubscribe = trash.onChange(listener);

    trash.trashNote(note.id);
    unsubscribe();
    trash.restoreNote(note.id);

    expect(listener).toHaveBeenCalledOnce();
  });
});

describe('TrashService — listTrashed', () => {
  it('returns an empty list when nothing is trashed', async () => {
    tasks.createTask({ title: 'Active', dueDate: TOMORROW });
    projects.createProject({ title: 'Active', dueDate: TOMORROW });
    await notesService.createNote({ title: 'Active' });

    expect(trash.listTrashed().items).toEqual([]);
  });

  it('returns trashed tasks, projects and notes in one list', async () => {
    const task = tasks.createTask({ title: 'Trashed task', dueDate: TOMORROW });
    const project = projects.createProject({
      title: 'Trashed project',
      dueDate: TOMORROW,
    });
    const note = await notesService.createNote({ title: 'Trashed note' });

    trash.trashTask(task.id);
    trash.trashProject(project.id);
    trash.trashNote(note.id);

    const result = trash.listTrashed().items;
    expect(result).toHaveLength(3);
    expect(result.map((entity) => entity.id).sort()).toEqual([task.id, project.id, note.id].sort());
  });

  it('tags each row with its entity type', async () => {
    const task = tasks.createTask({ title: 'T', dueDate: TOMORROW });
    const project = projects.createProject({ title: 'P', dueDate: TOMORROW });
    const note = await notesService.createNote({ title: 'N' });

    trash.trashTask(task.id);
    trash.trashProject(project.id);
    trash.trashNote(note.id);

    const byId = new Map(trash.listTrashed().items.map((entity) => [entity.id, entity]));
    expect(byId.get(task.id)?.entityType).toBe('tasks');
    expect(byId.get(project.id)?.entityType).toBe('projects');
    expect(byId.get(note.id)?.entityType).toBe('notes');
  });

  it('carries the title of each trashed entity', async () => {
    const task = tasks.createTask({ title: 'My task title', dueDate: TOMORROW });
    trash.trashTask(task.id);

    const [entity] = trash.listTrashed().items;
    expect(entity.title).toBe('My task title');
  });

  it('decodes trashedAt as a Date', async () => {
    const task = tasks.createTask({ title: 'T', dueDate: TOMORROW });
    const trashed = trash.trashTask(task.id);

    const [entity] = trash.listTrashed().items;
    expect(entity.trashedAt).toBeInstanceOf(Date);
    expect(entity.trashedAt.getTime()).toBe(trashed.trashedAt!.getTime());
  });

  it('sorts most recently trashed first, across entity types', async () => {
    const project = projects.createProject({ title: 'First', dueDate: TOMORROW });
    const task = tasks.createTask({ title: 'Second', dueDate: TOMORROW });
    const note = await notesService.createNote({ title: 'Third' });

    // trashedAt is stamped with Date.now() at trash time, so the writes have
    // to be spread out to produce a deterministic order
    trash.trashProject(project.id);
    await new Promise((resolve) => setTimeout(resolve, 5));
    trash.trashTask(task.id);
    await new Promise((resolve) => setTimeout(resolve, 5));
    trash.trashNote(note.id);

    const result = trash.listTrashed().items;
    expect(result.map((entity) => entity.id)).toEqual([note.id, task.id, project.id]);
  });

  it('excludes entities that have been restored', async () => {
    const task = tasks.createTask({ title: 'Restored', dueDate: TOMORROW });
    const stillTrashed = tasks.createTask({ title: 'Still trashed', dueDate: TOMORROW });

    trash.trashTask(task.id);
    trash.trashTask(stillTrashed.id);
    trash.restoreTask(task.id);

    expect(trash.listTrashed().items.map((entity) => entity.id)).toEqual([stillTrashed.id]);
  });

  it('lists cascade-trashed children alongside the entity that triggered them', async () => {
    const project = projects.createProject({ title: 'Parent project', dueDate: TOMORROW });
    const task = tasks.createTask({
      title: 'Task in project',
      dueDate: TOMORROW,
      projectId: project.id,
    });
    const note = await notesService.createNote({ title: 'Task note', linkedTaskId: task.id });

    trash.trashProject(project.id);

    const ids = trash.listTrashed().items.map((entity) => entity.id);
    expect(ids).toHaveLength(3);
    expect(ids).toContain(project.id);
    expect(ids).toContain(task.id);
    expect(ids).toContain(note.id);
  });
});

describe('TrashService — listTrashed cursor pagination', () => {
  function collect(limit: number) {
    const ids: string[] = [];
    let cursor: string | undefined;
    do {
      const page = trash.listTrashed({}, { limit, cursor });
      expect(page.items.length).toBeLessThanOrEqual(limit);
      ids.push(...page.items.map((entity) => entity.id));
      cursor = page.nextCursor ?? undefined;
    } while (cursor);
    return ids;
  }

  it('returns a null nextCursor when everything fits', async () => {
    const task = tasks.createTask({ title: 'T', dueDate: TOMORROW });
    trash.trashTask(task.id);

    const page = trash.listTrashed();
    expect(page.items).toHaveLength(1);
    expect(page.nextCursor).toBeNull();
  });

  it('paginated order matches unpaginated order, across entity types and tied trashedAt', async () => {
    // each project cascade stamps the project, its task and the task's note with
    // the same trashedAt, so pages have to break ties on id across all three tables
    for (let i = 0; i < 3; i++) {
      const project = projects.createProject({ title: `P${i}`, dueDate: TOMORROW });
      const task = tasks.createTask({
        title: `T${i}`,
        dueDate: TOMORROW,
        projectId: project.id,
      });
      await notesService.createNote({ title: `N${i}`, linkedTaskId: task.id });
      trash.trashProject(project.id);
      await new Promise((resolve) => setTimeout(resolve, 2));
    }
    const looseNote = await notesService.createNote({ title: 'Loose' });
    trash.trashNote(looseNote.id);

    const full = trash.listTrashed({}, { limit: 200 }).items.map((entity) => entity.id);
    expect(full).toHaveLength(10);
    expect(new Set(full).size).toBe(10);
    for (const limit of [1, 2, 3, 4]) {
      expect(collect(limit)).toEqual(full);
    }
  });

  it('rejects an invalid limit, a garbage cursor and a cursor from another list', async () => {
    const a = await notesService.createNote({ title: 'a' });
    const b = await notesService.createNote({ title: 'b' });
    trash.trashNote(a.id);
    trash.trashNote(b.id);

    expect(() => trash.listTrashed({}, { limit: 0 })).toThrow(RangeError);
    expect(() => trash.listTrashed({}, { cursor: '!!' })).toThrow(InvalidCursorError);

    // a cursor from a different list (here the active-notes list) is rejected
    await notesService.createNote({ title: 'c' });
    await notesService.createNote({ title: 'd' });
    const otherCursor = notesService.listNotes({}, { sortBy: 'title' }, { limit: 1 }).nextCursor!;
    expect(() => trash.listTrashed({}, { cursor: otherCursor })).toThrow(InvalidCursorError);
  });
});

describe('TrashService — listTrashed entity type filter', () => {
  // two of each entity type, trashed in a known order (oldest first)
  async function seed() {
    const created: { id: string; entityType: 'tasks' | 'projects' | 'notes' }[] = [];
    for (let i = 0; i < 2; i++) {
      const task = tasks.createTask({ title: `T${i}`, dueDate: TOMORROW });
      const project = projects.createProject({ title: `P${i}`, dueDate: TOMORROW });
      const note = await notesService.createNote({ title: `N${i}` });
      for (const [id, entityType, trashIt] of [
        [task.id, 'tasks', () => trash.trashTask(task.id)],
        [project.id, 'projects', () => trash.trashProject(project.id)],
        [note.id, 'notes', () => trash.trashNote(note.id)],
      ] as const) {
        trashIt();
        created.push({ id, entityType });
        // trashedAt is stamped with Date.now(), so spread the writes out
        await new Promise((resolve) => setTimeout(resolve, 2));
      }
    }
    // most recently trashed first, as listTrashed returns them
    return created.reverse();
  }

  it("defaults to 'all', and 'all' returns every entity type", async () => {
    const created = await seed();
    const all = trash.listTrashed({ entityType: 'all' }).items.map((entity) => entity.id);
    expect(all).toEqual(created.map((entity) => entity.id));
    expect(trash.listTrashed().items.map((entity) => entity.id)).toEqual(all);
  });

  it.each(['tasks', 'projects', 'notes'] as const)(
    'returns only trashed %s, most recently trashed first',
    async (entityType) => {
      const created = await seed();
      const result = trash.listTrashed({ entityType }).items;
      expect(result.every((entity) => entity.entityType === entityType)).toBe(true);
      expect(result.map((entity) => entity.id)).toEqual(
        created.filter((entity) => entity.entityType === entityType).map((entity) => entity.id),
      );
    },
  );

  it('carries the title and trashedAt for a single entity type', async () => {
    const note = await notesService.createNote({ title: 'Only note' });
    const trashed = trash.trashNote(note.id);

    const [entity] = trash.listTrashed({ entityType: 'notes' }).items;
    expect(entity).toEqual({
      id: note.id,
      entityType: 'notes',
      title: 'Only note',
      trashedAt: trashed.trashedAt,
      // a note's own fields (list-details.test.ts covers them)
      preview: null,
      project: null,
    });
  });

  it('includes cascade-trashed children under their own type', async () => {
    const project = projects.createProject({ title: 'Parent', dueDate: TOMORROW });
    const task = tasks.createTask({
      title: 'Child',
      dueDate: TOMORROW,
      projectId: project.id,
    });
    trash.trashProject(project.id);

    expect(trash.listTrashed({ entityType: 'tasks' }).items.map((e) => e.id)).toEqual([task.id]);
    expect(trash.listTrashed({ entityType: 'projects' }).items.map((e) => e.id)).toEqual([
      project.id,
    ]);
  });

  it.each(['all', 'tasks', 'projects', 'notes'] as const)(
    "paginates within the '%s' filter",
    async (entityType) => {
      await seed();
      const full = trash
        .listTrashed({ entityType }, { limit: 200 })
        .items.map((entity) => entity.id);

      const ids: string[] = [];
      let cursor: string | undefined;
      do {
        const page = trash.listTrashed({ entityType }, { limit: 1, cursor });
        expect(page.items.length).toBeLessThanOrEqual(1);
        ids.push(...page.items.map((entity) => entity.id));
        cursor = page.nextCursor ?? undefined;
      } while (cursor);
      expect(ids).toEqual(full);
    },
  );
});

describe('TrashService — trashTasks', () => {
  it('trashes every task with its subtree and linked notes, in one trashed change', async () => {
    const a = tasks.createTask({ title: 'A', dueDate: TOMORROW });
    const sub = tasks.createSubtask(a.id, { title: 'A sub' });
    const b = tasks.createTask({ title: 'B' });
    const kept = tasks.createTask({ title: 'Kept', dueDate: TOMORROW });
    const note = await notesService.createNote({ title: 'B notes', linkedTaskId: b.id });
    const changes: (TrashChange & { inTransaction: boolean })[] = [];
    trash.onChange((change) => changes.push({ ...change, inTransaction: inTransaction() }));

    const trashed = trash.trashTasks([b.id, a.id]);

    expect(trashed.map((t) => t.id)).toEqual([b.id, a.id]);
    expect(trashed.every((t) => t.trashedAt instanceof Date && t.external === null)).toBe(true);
    expect(tasks.getByIds([a.id, sub.id, b.id, kept.id]).map((t) => t.id)).toEqual([kept.id]);
    expect(changes).toHaveLength(1);
    expect(changes[0]).toMatchObject({
      type: 'trashed',
      projectIds: [],
      noteIds: [note.id],
      inTransaction: true,
    });
    expect([...changes[0].taskIds].sort()).toEqual([a.id, sub.id, b.id].sort());
  });

  it('takes a selected subtask along with its selected parent', () => {
    const parent = tasks.createTask({ title: 'Parent', dueDate: TOMORROW });
    const sub = tasks.createSubtask(parent.id, { title: 'Sub' });

    const trashed = trash.trashTasks([sub.id, parent.id]);

    expect(trashed.map((t) => t.id)).toEqual([sub.id, parent.id]);
    expect(tasks.getByIds([parent.id, sub.id])).toEqual([]);
  });

  it('fails as a whole for a missing or already trashed task, trashing none', () => {
    const a = tasks.createTask({ title: 'A', dueDate: TOMORROW });
    const done = tasks.createTask({ title: 'Done', dueDate: TOMORROW });
    trash.trashTask(done.id);
    const listener = vi.fn();
    trash.onChange(listener);

    expect(() => trash.trashTasks([a.id, 'tsk_missing' as TaskId])).toThrow(NotFoundError);
    expect(() => trash.trashTasks([a.id, done.id])).toThrow(AlreadyInTrashError);

    expect(tasks.getById(a.id).trashedAt).toBeNull();
    expect(listener).not.toHaveBeenCalled();
  });

  it('trashes a selection of thousands, with their subtasks', () => {
    // one subtree walk per id joined with OR hit SQLite's expression depth limit near 1000
    const trees = Array.from({ length: 2000 }, (_, i) => ({
      title: `T${i}`,
      subtasks: [{ title: `S${i}` }],
    }));
    const created = tasks.createTaskTrees(trees);
    const roots = created.filter((task) => task.parentTaskId === null).map((task) => task.id);

    expect(trash.trashTasks(roots)).toHaveLength(2000);
    expect(tasks.listTasks({}, undefined, { limit: 10 }).items).toEqual([]);
  });

  it('returns nothing for no ids, and counts a repeated id once', () => {
    const a = tasks.createTask({ title: 'A', dueDate: TOMORROW });
    expect(trash.trashTasks([])).toEqual([]);
    expect(trash.trashTasks([a.id, a.id])).toHaveLength(1);
  });
});
