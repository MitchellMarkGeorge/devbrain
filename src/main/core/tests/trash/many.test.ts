import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import Database from 'better-sqlite3';
import { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import type { NoteId, ProjectId, TaskId } from '@common/ids';
import type { TrashSelection } from '@common/types';
import { createDb } from '../utils';
import { TrashService, type TrashChange } from '../../trash/service';
import { NoteService } from '../../notes/service';
import { ProjectService } from '../../projects/service';
import { TaskService } from '../../tasks/service';
import { NotInTrashError, NotFoundError } from '../../shared/errors';

// Restoring and deleting rows chosen in Trash together (trash.restoreMany, trash.deleteMany):
// all or nothing, one change, and a row another one's cascade already handled counted once.

const TOMORROW = new Date(Date.now() + 24 * 60 * 60 * 1000);

let db: BetterSQLite3Database;
let trash: TrashService;
let tasks: TaskService;
let projects: ProjectService;
let notes: NoteService;
let workspacePath: string;
let changes: (TrashChange & { inTransaction: boolean })[];

beforeEach(async () => {
  db = createDb();
  workspacePath = await fs.mkdtemp(path.join(os.tmpdir(), 'devbrain-trash-many-'));
  await fs.mkdir(path.join(workspacePath, 'notes'), { recursive: true });
  tasks = new TaskService(db);
  projects = new ProjectService(db, new TaskService(db));
  notes = new NoteService(db, workspacePath);
  trash = new TrashService(db, notes);
  changes = [];
  const client = (db as typeof db & { $client: Database.Database }).$client;
  trash.onChange((change) => changes.push({ ...change, inTransaction: client.inTransaction }));
});

afterEach(async () => {
  await fs.rm(workspacePath, { recursive: true, force: true });
});

const select = (selection: Partial<TrashSelection>): TrashSelection => ({
  taskIds: [],
  projectIds: [],
  noteIds: [],
  ...selection,
});

const trashedIds = () => trash.listTrashed({}, { limit: 100 }).items.map((item) => item.id);
const sorted = <T extends string>(ids: T[]) => [...ids].sort();

// a trashed project with a task (and its note) in it, a trashed task with a subtask and a note,
// and a trashed note on its own
async function trashSome() {
  const project = projects.createProject({ title: 'Gateway' });
  const projectTask = tasks.createTask({
    title: 'In it',
    dueDate: TOMORROW,
    projectId: project.id,
  });
  const projectTaskNote = await notes.createNote({
    title: 'Its note',
    linkedTaskId: projectTask.id,
  });
  const parent = tasks.createTask({ title: 'Parent', dueDate: TOMORROW });
  const child = tasks.createSubtask(parent.id, { title: 'Child', dueDate: TOMORROW });
  const childNote = await notes.createNote({ title: 'On child', linkedTaskId: child.id });
  const loose = await notes.createNote({ title: 'Loose' });
  trash.trashProject(project.id);
  trash.trashTask(parent.id);
  trash.trashNote(loose.id);
  changes.length = 0;
  return { project, projectTask, projectTaskNote, parent, child, childNote, loose };
}

describe('TrashService.restoreMany', () => {
  it('restores each row with what its own restore brings back, in one change', async () => {
    const t = await trashSome();

    const result = trash.restoreMany(
      select({ projectIds: [t.project.id], taskIds: [t.parent.id], noteIds: [t.loose.id] }),
    );

    expect(trashedIds()).toEqual([]);
    expect(sorted(result.taskIds)).toEqual(sorted([t.projectTask.id, t.parent.id, t.child.id]));
    expect(result.projectIds).toEqual([t.project.id]);
    expect(sorted(result.noteIds)).toEqual(
      sorted([t.projectTaskNote.id, t.childNote.id, t.loose.id]),
    );
    expect(changes).toEqual([{ type: 'restored', ...result, inTransaction: true }]);
  });

  it('restores a task its chosen project brings back once, rather than refusing it', async () => {
    const t = await trashSome();

    const result = trash.restoreMany(
      select({ projectIds: [t.project.id], taskIds: [t.projectTask.id, t.projectTask.id] }),
    );

    expect(result.taskIds).toEqual([t.projectTask.id]);
    expect(tasks.getById(t.projectTask.id).trashedAt).toBeNull();
    // the rest stays in the trash
    expect(sorted(trashedIds())).toEqual(
      sorted([t.parent.id, t.child.id, t.childNote.id, t.loose.id]),
    );
  });

  it('restores nothing when one row is missing or not in the trash', async () => {
    const t = await trashSome();
    const live = tasks.createTask({ title: 'Live', dueDate: TOMORROW });
    const before = sorted(trashedIds());

    expect(() =>
      trash.restoreMany(select({ projectIds: [t.project.id], taskIds: [live.id] })),
    ).toThrow(NotInTrashError);
    expect(() =>
      trash.restoreMany(select({ noteIds: [t.loose.id, 'nte_missing' as NoteId] })),
    ).toThrow(NotFoundError);

    expect(sorted(trashedIds())).toEqual(before);
    expect(changes).toEqual([]);
  });

  it('does nothing for an empty selection', () => {
    expect(trash.restoreMany(select({}))).toEqual({ taskIds: [], projectIds: [], noteIds: [] });
    expect(changes).toEqual([]);
  });
});

describe('TrashService.deleteMany', () => {
  it('deletes the rows chosen for good, a task with its subtree, leaving the rest in the trash', async () => {
    const t = await trashSome();

    const result = await trash.deleteMany(
      select({ taskIds: [t.parent.id, t.child.id], noteIds: [t.loose.id] }),
    );

    expect(result).toEqual({
      taskIds: expect.arrayContaining([t.parent.id, t.child.id]),
      projectIds: [],
      noteIds: [t.loose.id],
      keptTaskIds: [],
      filesNotRemoved: [],
    });
    expect(result.taskIds).toHaveLength(2);
    expect(() => tasks.getById(t.child.id, { includeTrashed: true })).toThrow(NotFoundError);
    await expect(
      fs.access(path.join(workspacePath, 'notes', `${t.loose.id}.md`)),
    ).rejects.toThrow();
    // the child's note is kept, in the trash, without its task
    expect(sorted(trashedIds())).toEqual(
      sorted([t.project.id, t.projectTask.id, t.projectTaskNote.id, t.childNote.id]),
    );
    expect(notes.getById(t.childNote.id, { includeTrashed: true }).linkedTaskId).toBeNull();
    expect(changes).toEqual([
      expect.objectContaining({ type: 'emptied', noteIds: [t.loose.id], inTransaction: true }),
    ]);
  });

  it('deletes a project and leaves its tasks and notes, naming them as unlinked', async () => {
    const t = await trashSome();

    const result = await trash.deleteMany(select({ projectIds: [t.project.id] }));

    expect(result.projectIds).toEqual([t.project.id]);
    expect(tasks.getById(t.projectTask.id, { includeTrashed: true }).projectId).toBeNull();
    expect(changes).toEqual([
      expect.objectContaining({
        type: 'emptied',
        projectIds: [t.project.id],
        unlinkedTaskIds: [t.projectTask.id],
      }),
    ]);
  });

  it('keeps a task with a live subtask, as emptyTrash does', async () => {
    const parent = tasks.createTask({ title: 'Parent', dueDate: TOMORROW });
    const child = tasks.createSubtask(parent.id, { title: 'Child', dueDate: TOMORROW });
    trash.trashTask(parent.id);
    changes.length = 0;
    // as sync can leave it: the parent trashed, its subtask live
    (db as typeof db & { $client: Database.Database }).$client
      .prepare('update tasks set trashed_at = null where id = ?')
      .run(child.id);

    const result = await trash.deleteMany(select({ taskIds: [parent.id] }));

    expect(result).toMatchObject({ taskIds: [], keptTaskIds: [parent.id] });
    expect(changes).toEqual([]);
  });

  it('deletes nothing when one row is missing or not in the trash', async () => {
    const t = await trashSome();
    const live = await notes.createNote({ title: 'Live' });
    const before = sorted(trashedIds());

    await expect(
      trash.deleteMany(select({ taskIds: [t.parent.id], noteIds: [live.id] })),
    ).rejects.toThrow(NotInTrashError);
    await expect(
      trash.deleteMany(select({ projectIds: ['prj_missing' as ProjectId] })),
    ).rejects.toThrow(NotFoundError);

    expect(sorted(trashedIds())).toEqual(before);
    expect(changes).toEqual([]);
  });

  it('still empties the whole trash', async () => {
    const t = await trashSome();
    const result = await trash.emptyTrash();
    expect(trashedIds()).toEqual([]);
    expect(result.projectIds).toEqual([t.project.id]);
    expect(sorted(result.taskIds)).toEqual(
      sorted([t.projectTask.id, t.parent.id, t.child.id] as TaskId[]),
    );
  });
});
