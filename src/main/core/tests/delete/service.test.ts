import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import Database from 'better-sqlite3';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { and, eq, inArray } from 'drizzle-orm';
import { ExternalSourceId, NoteId, ProjectId, TaskId } from '@common/ids';
import { externalLinks, externalSources, integrations } from '@main/db/schema/integrations';
import { tasks as tasksTable } from '@main/db/schema/tasks';
import { projects as projectsTable } from '@main/db/schema/projects';
import { notes as notesTable } from '@main/db/schema/notes';
import { createDb } from '../utils';
import { ArchiveService } from '../../archive/service';
import { FavoritesService } from '../../favorites/service';
import { NoteChange, NoteService } from '../../notes/service';
import { ProjectChange, ProjectService } from '../../projects/service';
import { RecentsService } from '../../recents/service';
import { SearchService } from '../../search/service';
import { SyncWriter } from '../../sync/writer';
import { TaskPageItems } from '../../sync/types';
import { TaskChange, TaskService } from '../../tasks/service';
import { TaskPriority, TaskStatus } from '../../tasks/types';
import { ProjectStatus } from '../../projects/types';
import {
  AuthType,
  ExternalProject,
  ExternalTask,
  LinkState,
  Provider,
  SourceType,
} from '../../integrations/types';
import { ExternalReadOnlyError, NotArchivedError, NotFoundError } from '../../shared/errors';

// Permanent deletion of tasks, projects and notes (TaskService.deleteTask,
// ProjectService.deleteProject, NoteService.deleteNote), only from the trash: an item must be
// archived first. Search is kept in step by the workspace, which tests/workspace covers.

const TOMORROW = new Date(Date.now() + 86_400_000);
const CREATED = new Date('2026-01-15T09:00:00Z');
const V1 = new Date('2026-10-01T12:00:00Z');
const V2 = new Date('2026-10-02T12:00:00Z');

let db: BetterSQLite3Database;
let workspacePath: string;
let tasks: TaskService;
let projects: ProjectService;
let notes: NoteService;
let archive: ArchiveService;
let favorites: FavoritesService;
let recents: RecentsService;
let writer: SyncWriter;
let sourceId: ExternalSourceId;
let itemCount = 0;

beforeEach(async () => {
  db = createDb();
  workspacePath = await fs.mkdtemp(path.join(os.tmpdir(), 'devbrain-delete-'));
  await fs.mkdir(path.join(workspacePath, 'notes'), { recursive: true });
  tasks = new TaskService(db);
  projects = new ProjectService(db);
  notes = new NoteService(db, workspacePath);
  archive = new ArchiveService(db);
  favorites = new FavoritesService(db);
  recents = new RecentsService(db);
  writer = new SyncWriter(db, new SearchService(db, workspacePath));
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

// whether the database connection is inside a transaction now; createDb's type leaves out $client
function inTransaction(): boolean {
  return (db as typeof db & { $client: Database.Database }).$client.inTransaction;
}

function issue(overrides: Partial<ExternalTask> = {}): ExternalTask {
  itemCount += 1;
  return {
    externalId: `issue-${itemCount}`,
    key: `ENG-${itemCount}`,
    url: `https://linear.app/acme/issue/ENG-${itemCount}`,
    title: `Issue ${itemCount}`,
    description: null,
    status: TaskStatus.NOT_STARTED,
    priority: TaskPriority.LOW,
    statusLabel: 'Todo',
    priorityLabel: 'Low',
    startDate: null,
    dueDate: null,
    completedAt: null,
    createdAt: CREATED,
    updatedAt: V1,
    parentExternalId: null,
    parentKey: null,
    parentTitle: null,
    projectExternalId: null,
    assignedToViewer: true,
    ...overrides,
  };
}

function project(overrides: Partial<ExternalProject> = {}): ExternalProject {
  itemCount += 1;
  return {
    externalId: `project-${itemCount}`,
    url: `https://linear.app/acme/project/project-${itemCount}`,
    title: `Project ${itemCount}`,
    description: null,
    status: ProjectStatus.ACTIVE,
    statusLabel: 'Started',
    startDate: null,
    dueDate: null,
    color: null,
    completedAt: null,
    createdAt: CREATED,
    updatedAt: V1,
    ...overrides,
  };
}

function page(items: Partial<TaskPageItems>): TaskPageItems {
  return { projects: [], tasks: [], removedIds: [], ...items };
}

function linkOf(externalId: string) {
  return db
    .select()
    .from(externalLinks)
    .where(and(eq(externalLinks.sourceId, sourceId), eq(externalLinks.externalId, externalId)))
    .get();
}

function setLinkState(externalId: string, state: LinkState) {
  db.update(externalLinks)
    .set({ state })
    .where(and(eq(externalLinks.sourceId, sourceId), eq(externalLinks.externalId, externalId)))
    .run();
}

function taskRows(ids: TaskId[]) {
  return db.select().from(tasksTable).where(inArray(tasksTable.id, ids)).all();
}

function taskRow(id: TaskId) {
  return db.select().from(tasksTable).where(eq(tasksTable.id, id)).get();
}

function noteRow(id: NoteId) {
  return db.select().from(notesTable).where(eq(notesTable.id, id)).get();
}

function projectRow(id: ProjectId) {
  return db.select().from(projectsTable).where(eq(projectsTable.id, id)).get();
}

function noteFile(id: NoteId): string {
  return path.join(workspacePath, 'notes', `${id}.md`);
}

async function exists(file: string): Promise<boolean> {
  return fs.access(file).then(
    () => true,
    () => false,
  );
}

describe('foreign keys', () => {
  it('are enforced on a migrated connection, so deletes cascade and set null', () => {
    const sqlite = (db as typeof db & { $client: Database.Database }).$client;
    expect(sqlite.pragma('foreign_keys', { simple: true })).toBe(1);
  });
});

describe('TaskService.deleteTask', () => {
  it('deletes the task and its subtasks at any depth, and leaves other tasks alone', () => {
    const task = tasks.createTask({ title: 'Parent', dueDate: TOMORROW });
    const sub = tasks.createSubtask(task.id, { title: 'Child' });
    const grandchild = tasks.createSubtask(sub.id, { title: 'Grandchild' });
    const other = tasks.createTask({ title: 'Other', dueDate: TOMORROW });
    archive.archiveTask(task.id);

    const result = tasks.deleteTask(task.id);

    // the task asked for first
    expect(result.taskIds[0]).toBe(task.id);
    expect([...result.taskIds].sort()).toEqual([task.id, sub.id, grandchild.id].sort());
    expect(result.unlinkedNoteIds).toEqual([]);
    expect(taskRows([task.id, sub.id, grandchild.id])).toEqual([]);
    expect(taskRow(other.id)).toBeDefined();
  });

  it('deletes only a subtask and what is below it', () => {
    const task = tasks.createTask({ title: 'Parent', dueDate: TOMORROW });
    const sub = tasks.createSubtask(task.id, { title: 'Child' });
    const sibling = tasks.createSubtask(task.id, { title: 'Sibling' });
    archive.archiveTask(sub.id);

    expect(tasks.deleteTask(sub.id).taskIds).toEqual([sub.id]);
    expect(taskRow(task.id)).toBeDefined();
    expect(taskRow(sibling.id)).toBeDefined();
  });

  it('keeps the task notes of the task and its subtasks, unlinked, so each can be reused', async () => {
    const task = tasks.createTask({ title: 'Parent', dueDate: TOMORROW });
    const sub = tasks.createSubtask(task.id, { title: 'Child' });
    const taskNote = await notes.createNote({ title: 'On parent', linkedTaskId: task.id });
    const subNote = await notes.createNote({ title: 'On child', linkedTaskId: sub.id });
    const other = tasks.createTask({ title: 'Other', dueDate: TOMORROW });
    const otherNote = await notes.createNote({ title: 'On other', linkedTaskId: other.id });
    // the notes go to the trash with the task
    archive.archiveTask(task.id);

    const result = tasks.deleteTask(task.id);

    expect([...result.unlinkedNoteIds].sort()).toEqual([taskNote.id, subNote.id].sort());
    // still in the trash, where each can be restored or deleted on its own
    expect(noteRow(taskNote.id)).toMatchObject({
      linkedTaskId: null,
      archivedAt: expect.any(Date),
    });
    expect(noteRow(subNote.id)).toMatchObject({ linkedTaskId: null });
    expect(noteRow(otherNote.id)).toMatchObject({ linkedTaskId: other.id });
    // the note files are the user's and stay
    expect(await exists(noteFile(taskNote.id))).toBe(true);
    // a note freed by the delete can become another task's task note; one task note per task holds
    const fresh = tasks.createTask({ title: 'Fresh', dueDate: TOMORROW });
    notes.updateNote(taskNote.id, { linkedTaskId: fresh.id });
    expect(() => notes.updateNote(subNote.id, { linkedTaskId: fresh.id })).toThrow();
  });

  it('refuses an active task with not_archived, changing nothing', async () => {
    const task = tasks.createTask({ title: 'Parent', dueDate: TOMORROW });
    const sub = tasks.createSubtask(task.id, { title: 'Child' });
    const taskNote = await notes.createNote({ title: 'On parent', linkedTaskId: task.id });
    const listener = vi.fn();
    tasks.onChange(listener);

    expect(() => tasks.deleteTask(task.id)).toThrow(NotArchivedError);
    expect(() => tasks.deleteTask(sub.id)).toThrow(NotArchivedError);
    expect(taskRows([task.id, sub.id])).toHaveLength(2);
    expect(noteRow(taskNote.id)).toMatchObject({ linkedTaskId: task.id });
    expect(listener).not.toHaveBeenCalled();
  });

  it('leaves the trash with the rest of what was archived along', async () => {
    const task = tasks.createTask({ title: 'Parent', dueDate: TOMORROW });
    const taskNote = await notes.createNote({ title: 'On parent', linkedTaskId: task.id });
    archive.archiveTask(task.id);

    tasks.deleteTask(task.id);

    expect(archive.listArchived().items.map((item) => item.id)).toEqual([taskNote.id]);
  });

  it('deletes an archived subtask on its own', () => {
    const task = tasks.createTask({ title: 'Parent', dueDate: TOMORROW });
    const sub = tasks.createSubtask(task.id, { title: 'Child' });
    archive.archiveTask(task.id);

    expect(tasks.deleteTask(sub.id).taskIds).toEqual([sub.id]);
    expect(taskRow(task.id)).toBeDefined();
  });

  it('takes the task out of favorites and recents', () => {
    const task = tasks.createTask({ title: 'Parent', dueDate: TOMORROW });
    const kept = tasks.createTask({ title: 'Kept', dueDate: TOMORROW });
    favorites.favoriteTask(task.id);
    favorites.favoriteTask(kept.id);
    recents.recordView(task.id);
    recents.recordView(kept.id);
    archive.archiveTask(task.id);

    tasks.deleteTask(task.id);

    expect(favorites.listFavorites().items.map((item) => item.entity.id)).toEqual([kept.id]);
    expect(recents.listRecents().items.map((item) => item.entity.id)).toEqual([kept.id]);
  });

  it('throws NotFoundError for an unknown task, and for one already deleted', () => {
    const task = tasks.createTask({ title: 'Parent', dueDate: TOMORROW });
    archive.archiveTask(task.id);
    tasks.deleteTask(task.id);

    expect(() => tasks.deleteTask(task.id)).toThrow(NotFoundError);
    expect(() => tasks.deleteTask('tsk_unknown' as TaskId)).toThrow(NotFoundError);
  });

  it('sends every id it removed, as the last step of its transaction', async () => {
    const task = tasks.createTask({ title: 'Parent', dueDate: TOMORROW });
    const sub = tasks.createSubtask(task.id, { title: 'Child' });
    const taskNote = await notes.createNote({ title: 'On parent', linkedTaskId: task.id });
    archive.archiveTask(task.id);
    const changes: (TaskChange & { inTransaction: boolean })[] = [];
    tasks.onChange((change) => changes.push({ ...change, inTransaction: inTransaction() }));

    const result = tasks.deleteTask(task.id);

    expect(changes).toEqual([{ type: 'deleted', ...result, inTransaction: true }]);
    expect(result).toEqual({ taskIds: [task.id, sub.id], unlinkedNoteIds: [taskNote.id] });
  });

  it('sends nothing and deletes nothing when it fails', () => {
    const listener = vi.fn();
    tasks.onChange(listener);

    expect(() => tasks.deleteTask('tsk_unknown' as TaskId)).toThrow(NotFoundError);
    expect(listener).not.toHaveBeenCalled();
  });
});

describe('TaskService.deleteTask — synced tasks', () => {
  it('refuses a synced task, which is never in the trash, changing nothing', () => {
    const parent = issue();
    const child = issue({ parentExternalId: parent.externalId });
    writer.applyTaskPage(sourceId, page({ tasks: [parent, child] }));
    const taskId = linkOf(parent.externalId)!.taskId!;

    expect(() => tasks.deleteTask(taskId)).toThrow(NotArchivedError);
    // and it cannot be put there: archive refuses it
    expect(() => archive.archiveTask(taskId)).toThrow(ExternalReadOnlyError);
    expect(taskRow(taskId)).toBeDefined();
    expect(linkOf(child.externalId)!.state).toBe(LinkState.SYNCED);
  });

  it('refuses a removed task while synced subtasks are still live under it', () => {
    const parent = issue();
    const child = issue({ parentExternalId: parent.externalId });
    writer.applyTaskPage(sourceId, page({ tasks: [parent, child] }));
    // sync archives the parent alone
    writer.applyTaskPage(sourceId, page({ removedIds: [parent.externalId] }));
    const taskId = linkOf(parent.externalId)!.taskId!;
    const childId = linkOf(child.externalId)!.taskId!;
    expect(taskRow(taskId)?.archivedAt).not.toBeNull();

    expect(() => tasks.deleteTask(taskId)).toThrow(NotArchivedError);
    expect(taskRow(childId)).toMatchObject({ archivedAt: null });
  });

  it('deletes a detached task and its detached subtree, with their links', () => {
    const parent = issue();
    const child = issue({ parentExternalId: parent.externalId });
    writer.applyTaskPage(sourceId, page({ tasks: [parent, child] }));
    // what DetachService.detachTask does to the subtree
    setLinkState(parent.externalId, LinkState.DETACHED);
    setLinkState(child.externalId, LinkState.DETACHED);
    const taskId = linkOf(parent.externalId)!.taskId!;
    const childId = linkOf(child.externalId)!.taskId!;
    archive.archiveTask(taskId);

    expect(tasks.deleteTask(taskId).taskIds).toEqual([taskId, childId]);
    expect(linkOf(parent.externalId)).toBeUndefined();
    expect(linkOf(child.externalId)).toBeUndefined();
  });

  it("only deletes the user's copy: if Linear sends the issue again, it syncs back as a new task", () => {
    const item = issue();
    writer.applyTaskPage(sourceId, page({ tasks: [item] }));
    setLinkState(item.externalId, LinkState.DETACHED);
    const taskId = linkOf(item.externalId)!.taskId!;
    archive.archiveTask(taskId);
    tasks.deleteTask(taskId);

    // still assigned, and changed in Linear since
    const summary = writer.applyTaskPage(sourceId, page({ tasks: [{ ...item, updatedAt: V2 }] }));

    expect(summary.inserted).toBe(1);
    const link = linkOf(item.externalId)!;
    expect(link.state).toBe(LinkState.SYNCED);
    expect(link.taskId).not.toBe(taskId);
    expect(taskRow(link.taskId!)).toMatchObject({ archivedAt: null });
  });

  it('deletes a removed task (archived by sync); it comes back new if assigned again', async () => {
    const item = issue();
    writer.applyTaskPage(sourceId, page({ tasks: [item] }));
    writer.applyTaskPage(sourceId, page({ removedIds: [item.externalId] }));
    const taskId = linkOf(item.externalId)!.taskId!;
    expect(taskRow(taskId)?.archivedAt).not.toBeNull();
    const taskNote = await notes.createNote({ title: 'Kept', linkedTaskId: taskId });

    expect(tasks.deleteTask(taskId)).toEqual({ taskIds: [taskId], unlinkedNoteIds: [taskNote.id] });

    writer.applyTaskPage(sourceId, page({ tasks: [{ ...item, updatedAt: V2 }] }));
    expect(linkOf(item.externalId)).toMatchObject({ state: LinkState.SYNCED });
    expect(linkOf(item.externalId)!.taskId).not.toBe(taskId);
  });

  it('deletes a local subtask of a detached task, leaving the detached task alone', () => {
    const item = issue();
    writer.applyTaskPage(sourceId, page({ tasks: [item] }));
    setLinkState(item.externalId, LinkState.DETACHED);
    const taskId = linkOf(item.externalId)!.taskId!;
    const local = tasks.createSubtask(taskId, { title: 'Mine', dueDate: TOMORROW });
    archive.archiveTask(local.id);

    expect(tasks.deleteTask(local.id).taskIds).toEqual([local.id]);
    expect(linkOf(item.externalId)!.state).toBe(LinkState.DETACHED);
  });
});

describe('ProjectService.deleteProject', () => {
  it('deletes the project and keeps its tasks and notes, without it', async () => {
    const proj = projects.createProject({ title: 'Launch', dueDate: TOMORROW });
    const task = tasks.createTask({ title: 'Task', dueDate: TOMORROW, projectId: proj.id });
    const sub = tasks.createSubtask(task.id, { title: 'Child' });
    const note = await notes.createNote({ title: 'Plan', projectId: proj.id });
    const otherProject = projects.createProject({ title: 'Other', dueDate: TOMORROW });
    const otherTask = tasks.createTask({
      title: 'Elsewhere',
      dueDate: TOMORROW,
      projectId: otherProject.id,
    });
    // its tasks and notes go to the trash with it
    archive.archiveProject(proj.id);

    const result = projects.deleteProject(proj.id);

    expect(result.projectId).toBe(proj.id);
    expect([...result.unfiledTaskIds].sort()).toEqual([task.id, sub.id].sort());
    expect(result.unfiledNoteIds).toEqual([note.id]);
    expect(projectRow(proj.id)).toBeUndefined();
    // still in the trash, without the project, where each can be restored on its own
    expect(taskRow(task.id)).toMatchObject({ projectId: null, archivedAt: expect.any(Date) });
    expect(taskRow(sub.id)).toMatchObject({ projectId: null, parentTaskId: task.id });
    expect(noteRow(note.id)).toMatchObject({ projectId: null, archivedAt: expect.any(Date) });
    expect(taskRow(otherTask.id)).toMatchObject({ projectId: otherProject.id, archivedAt: null });
    expect(
      archive
        .listArchived()
        .items.map((item) => item.id)
        .sort(),
    ).toEqual([task.id, sub.id, note.id].sort());
    archive.restoreTask(task.id);
    expect(tasks.getById(task.id).projectId).toBeNull();
  });

  it('refuses an active project with not_archived', () => {
    const proj = projects.createProject({ title: 'Launch', dueDate: TOMORROW });
    const task = tasks.createTask({ title: 'Task', dueDate: TOMORROW, projectId: proj.id });

    expect(() => projects.deleteProject(proj.id)).toThrow(NotArchivedError);
    expect(projectRow(proj.id)).toBeDefined();
    expect(taskRow(task.id)).toMatchObject({ projectId: proj.id });
  });

  it('takes the project out of favorites and recents', () => {
    const proj = projects.createProject({ title: 'Launch', dueDate: TOMORROW });
    favorites.favoriteProject(proj.id);
    recents.recordView(proj.id);
    archive.archiveProject(proj.id);

    projects.deleteProject(proj.id);

    expect(favorites.listFavorites().items).toEqual([]);
    expect(recents.listRecents().items).toEqual([]);
  });

  it('refuses a synced project, which is never in the trash', () => {
    const proj = project();
    writer.applyTaskPage(
      sourceId,
      page({ projects: [proj], tasks: [issue({ projectExternalId: proj.externalId })] }),
    );
    const projectId = linkOf(proj.externalId)!.projectId!;

    expect(() => projects.deleteProject(projectId)).toThrow(NotArchivedError);
    expect(() => archive.archiveProject(projectId)).toThrow(ExternalReadOnlyError);
    expect(projectRow(projectId)).toBeDefined();
  });

  it('deletes a detached project; it comes back as a new one only when Linear brings it back', () => {
    const proj = project();
    const item = issue({ projectExternalId: proj.externalId });
    writer.applyTaskPage(sourceId, page({ projects: [proj], tasks: [item] }));
    const projectId = linkOf(proj.externalId)!.projectId!;
    // what sync does to a project left holding only the user's tasks
    setLinkState(proj.externalId, LinkState.DETACHED);
    writer.applyTaskPage(sourceId, page({ removedIds: [item.externalId] }));
    const local = tasks.createTask({ title: 'Mine', dueDate: TOMORROW, projectId });
    archive.archiveProject(projectId);

    expect(projects.deleteProject(projectId).unfiledTaskIds.sort()).toEqual(
      [local.id, linkOf(item.externalId)!.taskId!].sort(),
    );
    expect(linkOf(proj.externalId)).toBeUndefined();

    writer.applyTaskPage(
      sourceId,
      page({ projects: [{ ...proj, updatedAt: V2 }], tasks: [{ ...item, updatedAt: V2 }] }),
    );
    expect(linkOf(proj.externalId)!.projectId).not.toBe(projectId);
  });

  it('throws NotFoundError for an unknown project', () => {
    expect(() => projects.deleteProject('prj_unknown' as ProjectId)).toThrow(NotFoundError);
  });

  it('sends what it changed, as the last step of its transaction', () => {
    const proj = projects.createProject({ title: 'Launch', dueDate: TOMORROW });
    const task = tasks.createTask({ title: 'Task', dueDate: TOMORROW, projectId: proj.id });
    archive.archiveProject(proj.id);
    const changes: (ProjectChange & { inTransaction: boolean })[] = [];
    projects.onChange((change) => changes.push({ ...change, inTransaction: inTransaction() }));

    projects.deleteProject(proj.id);

    expect(changes).toEqual([
      {
        type: 'deleted',
        projectId: proj.id,
        unfiledTaskIds: [task.id],
        unfiledNoteIds: [],
        inTransaction: true,
      },
    ]);
  });
});

describe('NoteService.deleteNote', () => {
  it('deletes the row and the file, and keeps linked tasks, unlinked', async () => {
    const note = await notes.createNote({ title: 'Spec' });
    await notes.updateNoteContent(note.id, '# Spec');
    const task = tasks.createTask({
      title: 'From the note',
      dueDate: TOMORROW,
      linkedNoteId: note.id,
    });
    const sub = tasks.createSubtask(task.id, { title: 'Child' });
    const other = await notes.createNote({ title: 'Other' });
    archive.archiveNote(note.id);

    const result = await notes.deleteNote(note.id);

    expect(result.noteId).toBe(note.id);
    expect(result.fileRemoved).toBe(true);
    expect([...result.unlinkedTaskIds].sort()).toEqual([task.id, sub.id].sort());
    expect(noteRow(note.id)).toBeUndefined();
    expect(await exists(noteFile(note.id))).toBe(false);
    expect(taskRow(task.id)).toMatchObject({ linkedNoteId: null });
    expect(taskRow(sub.id)).toMatchObject({ linkedNoteId: null });
    expect(await exists(noteFile(other.id))).toBe(true);
  });

  it('deletes a task note, naming its task, which is kept with no task note', async () => {
    const task = tasks.createTask({ title: 'Task', dueDate: TOMORROW });
    const note = await notes.createNote({ title: 'Task note', linkedTaskId: task.id });
    const before = taskRow(task.id)!;
    archive.archiveNote(note.id);

    const result = await notes.deleteNote(note.id);

    expect(result).toMatchObject({ linkedTaskId: task.id, unlinkedTaskIds: [] });
    // the link lived on the note: the task row is not written
    expect(taskRow(task.id)).toEqual(before);
    expect(notes.listNotes({ linkedTaskId: task.id }).items).toEqual([]);
    // the task can take a new task note
    const next = await notes.createNote({ title: 'New task note', linkedTaskId: task.id });
    expect(noteRow(next.id)).toMatchObject({ linkedTaskId: task.id });
  });

  it('names no task for a note that was not a task note', async () => {
    const note = await notes.createNote({ title: 'Loose' });
    archive.archiveNote(note.id);

    expect((await notes.deleteNote(note.id)).linkedTaskId).toBeNull();
  });

  it('refuses an active note with not_archived, keeping its file', async () => {
    const note = await notes.createNote({ title: 'Spec' });

    await expect(notes.deleteNote(note.id)).rejects.toThrow(NotArchivedError);
    expect(noteRow(note.id)).toBeDefined();
    expect(await exists(noteFile(note.id))).toBe(true);
  });

  it('leaves the trash', async () => {
    const note = await notes.createNote({ title: 'Spec' });
    archive.archiveNote(note.id);

    await notes.deleteNote(note.id);

    expect(archive.listArchived().items).toEqual([]);
  });

  it('takes the note out of favorites and recents', async () => {
    const note = await notes.createNote({ title: 'Spec' });
    favorites.favoriteNote(note.id);
    recents.recordView(note.id);
    archive.archiveNote(note.id);

    await notes.deleteNote(note.id);

    expect(favorites.listFavorites().items).toEqual([]);
    expect(recents.listRecents().items).toEqual([]);
  });

  it('throws NotFoundError for an unknown note, and for one already deleted', async () => {
    const note = await notes.createNote({ title: 'Spec' });
    archive.archiveNote(note.id);
    await notes.deleteNote(note.id);

    await expect(notes.deleteNote(note.id)).rejects.toThrow(NotFoundError);
    await expect(notes.deleteNote('nte_unknown' as NoteId)).rejects.toThrow(NotFoundError);
  });

  it('counts a file already missing as removed', async () => {
    const note = await notes.createNote({ title: 'Spec' });
    await fs.rm(noteFile(note.id));
    archive.archiveNote(note.id);

    expect((await notes.deleteNote(note.id)).fileRemoved).toBe(true);
  });

  it('still deletes the note when its file cannot be removed, and logs the failure', async () => {
    const logger = { warn: vi.fn() };
    notes = new NoteService(db, workspacePath, logger);
    const note = await notes.createNote({ title: 'Spec' });
    // a non-empty directory where the file was: removing it fails
    await fs.rm(noteFile(note.id));
    await fs.mkdir(noteFile(note.id));
    await fs.writeFile(path.join(noteFile(note.id), 'inside'), '');
    archive.archiveNote(note.id);

    const result = await notes.deleteNote(note.id);

    expect(result.fileRemoved).toBe(false);
    expect(noteRow(note.id)).toBeUndefined();
    expect(logger.warn).toHaveBeenCalledTimes(1);
    // the class only, never the path
    expect(logger.warn.mock.calls[0][0]).not.toContain(workspacePath);
  });

  it('waits for a content save still writing, so it does not write the file back', async () => {
    const note = await notes.createNote({ title: 'Spec' });

    // saving when the note is trashed and deleted at once
    const save = notes.updateNoteContent(note.id, 'one');
    archive.archiveNote(note.id);
    const deletion = notes.deleteNote(note.id);
    // called after the delete: finds no note
    const late = notes.updateNoteContent(note.id, 'three');

    await expect(save).resolves.toMatchObject({ id: note.id });
    expect((await deletion).fileRemoved).toBe(true);
    await expect(late).rejects.toThrow(NotFoundError);
    expect(await exists(noteFile(note.id))).toBe(false);
    expect(await fs.readdir(path.join(workspacePath, 'notes'))).toEqual([]);
  });

  it('sends the delete inside its transaction, before the file is removed', async () => {
    const note = await notes.createNote({ title: 'Spec' });
    const task = tasks.createTask({ title: 'Task', dueDate: TOMORROW, linkedNoteId: note.id });
    archive.archiveNote(note.id);
    const changes: (NoteChange & { inTransaction: boolean })[] = [];
    notes.onChange((change) => changes.push({ ...change, inTransaction: inTransaction() }));

    await notes.deleteNote(note.id);

    expect(changes).toEqual([
      {
        type: 'deleted',
        noteId: note.id,
        linkedTaskId: null,
        unlinkedTaskIds: [task.id],
        inTransaction: true,
      },
    ]);
  });
});
