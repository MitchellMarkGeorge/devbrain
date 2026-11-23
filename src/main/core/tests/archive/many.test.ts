import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import Database from 'better-sqlite3';
import { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import type { NoteId, ProjectId, TaskId } from '@common/ids';
import type { TrashSelection } from '@common/types';
import { eq } from 'drizzle-orm';
import { tasks as tasksSchema } from '@main/db/schema/tasks';
import { createDb } from '../utils';
import { ArchiveService, type ArchiveChange } from '../../archive/service';
import { NoteService } from '../../notes/service';
import { ProjectService } from '../../projects/service';
import { TaskService } from '../../tasks/service';
import { NotArchivedError, NotFoundError } from '../../shared/errors';

// Restoring and deleting rows chosen in Trash together (archive.restoreMany, archive.deleteMany):
// all or nothing, one change, and a row another one's cascade already handled counted once.

const TOMORROW = new Date(Date.now() + 24 * 60 * 60 * 1000);

let db: BetterSQLite3Database;
let archive: ArchiveService;
let tasks: TaskService;
let projects: ProjectService;
let notes: NoteService;
let workspacePath: string;
let changes: (ArchiveChange & { inTransaction: boolean })[];

beforeEach(async () => {
  db = createDb();
  workspacePath = await fs.mkdtemp(path.join(os.tmpdir(), 'devbrain-trash-many-'));
  await fs.mkdir(path.join(workspacePath, 'notes'), { recursive: true });
  tasks = new TaskService(db);
  projects = new ProjectService(db, new TaskService(db));
  notes = new NoteService(db, workspacePath);
  archive = new ArchiveService(db, notes);
  changes = [];
  const client = (db as typeof db & { $client: Database.Database }).$client;
  archive.onChange((change) => changes.push({ ...change, inTransaction: client.inTransaction }));
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

const trashedIds = () => archive.listArchived({}, { limit: 100 }).items.map((item) => item.id);
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
  archive.archiveProject(project.id);
  archive.archiveTask(parent.id);
  archive.archiveNote(loose.id);
  changes.length = 0;
  return { project, projectTask, projectTaskNote, parent, child, childNote, loose };
}

describe('ArchiveService.restoreMany', () => {
  it('restores each row with what its own restore brings back, in one change', async () => {
    const t = await trashSome();

    const result = archive.restoreMany(
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

    const result = archive.restoreMany(
      select({ projectIds: [t.project.id], taskIds: [t.projectTask.id, t.projectTask.id] }),
    );

    expect(result.taskIds).toEqual([t.projectTask.id]);
    expect(tasks.getById(t.projectTask.id).archivedAt).toBeNull();
    // the rest stays in the trash
    expect(sorted(trashedIds())).toEqual(
      sorted([t.parent.id, t.child.id, t.childNote.id, t.loose.id]),
    );
  });

  it('brings back only what went to the trash with each chosen project', async () => {
    const project = projects.createProject({ title: 'Gateway' });
    const earlier = tasks.createTask({
      title: 'Trashed first',
      dueDate: TOMORROW,
      projectId: project.id,
    });
    const withIt = tasks.createTask({
      title: 'Went with it',
      dueDate: TOMORROW,
      projectId: project.id,
    });
    const other = projects.createProject({ title: 'Billing' });
    const otherTask = tasks.createTask({
      title: 'Billing task',
      dueDate: TOMORROW,
      projectId: other.id,
    });
    archive.archiveTask(earlier.id);
    // a minute before the projects, so its time differs from theirs
    db.update(tasksSchema)
      .set({ archivedAt: new Date(Date.now() - 60_000) })
      .where(eq(tasksSchema.id, earlier.id))
      .run();
    archive.archiveProject(project.id);
    archive.archiveProject(other.id);

    const result = archive.restoreMany(select({ projectIds: [project.id, other.id] }));

    expect(sorted(result.taskIds)).toEqual(sorted([withIt.id, otherTask.id]));
    expect(trashedIds()).toEqual([earlier.id]);
  });

  it('restores a chosen subtask trashed before its chosen parent, and each with what went with it', async () => {
    const parent = tasks.createTask({ title: 'Parent', dueDate: TOMORROW });
    const earlier = tasks.createSubtask(parent.id, { title: 'Trashed first', dueDate: TOMORROW });
    const other = tasks.createSubtask(parent.id, {
      title: 'Also trashed first',
      dueDate: TOMORROW,
    });
    archive.archiveTask(earlier.id);
    archive.archiveTask(other.id);
    db.update(tasksSchema)
      .set({ archivedAt: new Date(Date.now() - 60_000) })
      .where(eq(tasksSchema.id, earlier.id))
      .run();
    db.update(tasksSchema)
      .set({ archivedAt: new Date(Date.now() - 120_000) })
      .where(eq(tasksSchema.id, other.id))
      .run();
    archive.archiveTask(parent.id);

    const result = archive.restoreMany(select({ taskIds: [parent.id, earlier.id] }));

    expect(sorted(result.taskIds)).toEqual(sorted([parent.id, earlier.id]));
    expect(trashedIds()).toEqual([other.id]);
  });

  it('restores nothing when one row is missing or not in the trash', async () => {
    const t = await trashSome();
    const live = tasks.createTask({ title: 'Live', dueDate: TOMORROW });
    const before = sorted(trashedIds());

    expect(() =>
      archive.restoreMany(select({ projectIds: [t.project.id], taskIds: [live.id] })),
    ).toThrow(NotArchivedError);
    expect(() =>
      archive.restoreMany(select({ noteIds: [t.loose.id, 'nte_missing' as NoteId] })),
    ).toThrow(NotFoundError);

    expect(sorted(trashedIds())).toEqual(before);
    expect(changes).toEqual([]);
  });

  it('does nothing for an empty selection', () => {
    expect(archive.restoreMany(select({}))).toEqual({ taskIds: [], projectIds: [], noteIds: [] });
    expect(changes).toEqual([]);
  });
});

describe('ArchiveService.deleteMany', () => {
  it('deletes the rows chosen for good, a task with its subtree, leaving the rest in the trash', async () => {
    const t = await trashSome();

    const result = await archive.deleteMany(
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
    expect(() => tasks.getById(t.child.id, { includeArchived: true })).toThrow(NotFoundError);
    await expect(
      fs.access(path.join(workspacePath, 'notes', `${t.loose.id}.md`)),
    ).rejects.toThrow();
    // the child's note is kept, in the trash, without its task
    expect(sorted(trashedIds())).toEqual(
      sorted([t.project.id, t.projectTask.id, t.projectTaskNote.id, t.childNote.id]),
    );
    expect(notes.getById(t.childNote.id, { includeArchived: true }).linkedTaskId).toBeNull();
    expect(changes).toEqual([
      expect.objectContaining({ type: 'emptied', noteIds: [t.loose.id], inTransaction: true }),
    ]);
  });

  it('deletes a project and leaves its tasks and notes, naming them as unlinked', async () => {
    const t = await trashSome();

    const result = await archive.deleteMany(select({ projectIds: [t.project.id] }));

    expect(result.projectIds).toEqual([t.project.id]);
    expect(tasks.getById(t.projectTask.id, { includeArchived: true }).projectId).toBeNull();
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
    archive.archiveTask(parent.id);
    changes.length = 0;
    // as sync can leave it: the parent archived, its subtask live
    (db as typeof db & { $client: Database.Database }).$client
      .prepare('update tasks set archived_at = null where id = ?')
      .run(child.id);

    const result = await archive.deleteMany(select({ taskIds: [parent.id] }));

    expect(result).toMatchObject({ taskIds: [], keptTaskIds: [parent.id] });
    expect(changes).toEqual([]);
  });

  it('deletes nothing when one row is missing or not in the trash', async () => {
    const t = await trashSome();
    const live = await notes.createNote({ title: 'Live' });
    const before = sorted(trashedIds());

    await expect(
      archive.deleteMany(select({ taskIds: [t.parent.id], noteIds: [live.id] })),
    ).rejects.toThrow(NotArchivedError);
    await expect(
      archive.deleteMany(select({ projectIds: ['prj_missing' as ProjectId] })),
    ).rejects.toThrow(NotFoundError);

    expect(sorted(trashedIds())).toEqual(before);
    expect(changes).toEqual([]);
  });

  it('still empties the whole trash', async () => {
    const t = await trashSome();
    const result = await archive.emptyTrash();
    expect(trashedIds()).toEqual([]);
    expect(result.projectIds).toEqual([t.project.id]);
    expect(sorted(result.taskIds)).toEqual(
      sorted([t.projectTask.id, t.parent.id, t.child.id] as TaskId[]),
    );
  });
});

describe('ArchiveService.previewArchive', () => {
  it('lists the subtasks and notes a task takes along, and leaves out the rows chosen', async () => {
    const parent = tasks.createTask({ title: 'Parent', dueDate: TOMORROW });
    const b = tasks.createSubtask(parent.id, { title: 'B child', dueDate: TOMORROW });
    const a = tasks.createSubtask(parent.id, { title: 'A child', dueDate: TOMORROW });
    const parentNote = await notes.createNote({ title: 'On parent', linkedTaskId: parent.id });
    const childNote = await notes.createNote({ title: 'On child', linkedTaskId: a.id });
    await notes.createNote({ title: 'Unrelated' });

    const preview = archive.previewArchive(select({ taskIds: [parent.id, b.id] }));

    expect(preview.tasks).toEqual([{ id: a.id, title: 'A child', status: a.status }]);
    expect(preview.notes.map((note) => note.id)).toEqual([childNote.id, parentNote.id]);
    // reads only
    expect(changes).toEqual([]);
    expect(trashedIds()).toEqual([]);
  });

  it('lists what the archive would stamp, and nothing already in the trash', async () => {
    const parent = tasks.createTask({ title: 'Parent', dueDate: TOMORROW });
    const trashed = tasks.createSubtask(parent.id, { title: 'Trashed', dueDate: TOMORROW });
    const kept = tasks.createSubtask(parent.id, { title: 'Kept', dueDate: TOMORROW });
    const trashedNote = await notes.createNote({ title: 'Gone', linkedTaskId: kept.id });
    archive.archiveTask(trashed.id);
    archive.archiveNote(trashedNote.id);
    const project = projects.createProject({ title: 'Gateway' });
    const projectTask = tasks.createTask({
      title: 'In it',
      dueDate: TOMORROW,
      projectId: project.id,
    });
    const projectNote = await notes.createNote({ title: 'Project note', projectId: project.id });

    const preview = archive.previewArchive(
      select({ taskIds: [parent.id], projectIds: [project.id] }),
    );

    expect(sorted(preview.tasks.map((task) => task.id))).toEqual(sorted([kept.id, projectTask.id]));
    expect(preview.notes.map((note) => note.id)).toEqual([projectNote.id]);
  });

  it('takes nothing along for notes alone', async () => {
    const task = tasks.createTask({ title: 'Task', dueDate: TOMORROW });
    const note = await notes.createNote({ title: 'Note', linkedTaskId: task.id });
    expect(archive.previewArchive(select({ noteIds: [note.id] }))).toEqual({
      tasks: [],
      notes: [],
    });
  });
});
