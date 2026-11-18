import { describe, it, expect, beforeEach, afterEach, vi, type Mock } from 'vitest';
import { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { generateId } from '@common/ids';
import { ProjectStatus, TaskPriority, TaskStatus } from '@common/types';
import { createDb } from '../utils';
import { ArchiveService } from '../../archive/service';
import { FavoritesService } from '../../favorites/service';
import { NoteService } from '../../notes/service';
import { ProjectService } from '../../projects/service';
import { TaskService } from '../../tasks/service';
import { AlreadyArchivedError, NotFoundError } from '../../shared/errors';
import { assertNotTrashed } from '../../shared/trash';

// A task, project or note in the trash opens read-only, and core holds that rule: every write a
// user makes to one throws AlreadyArchivedError, changes nothing and sends no change. Restoring it
// makes it writable again; deleting and restoring are the archive's own paths (tests/delete,
// tests/archive). docs/deleting.md, "Writes to items in the trash".

const DUE = new Date('2026-12-01T00:00:00.000Z');

let db: BetterSQLite3Database;
let workspacePath: string;
let tasks: TaskService;
let projects: ProjectService;
let notes: NoteService;
let archive: ArchiveService;
let favorites: FavoritesService;
let sent: Mock<(change: unknown) => void>;

beforeEach(async () => {
  db = createDb();
  workspacePath = await fs.mkdtemp(path.join(os.tmpdir(), 'devbrain-trash-writes-'));
  await fs.mkdir(path.join(workspacePath, 'notes'), { recursive: true });
  tasks = new TaskService(db);
  projects = new ProjectService(db, tasks);
  notes = new NoteService(db, workspacePath);
  archive = new ArchiveService(db);
  favorites = new FavoritesService(db);
  sent = vi.fn();
  tasks.onChange(sent);
  projects.onChange(sent);
  notes.onChange(sent);
  favorites.onChange(sent);
});

afterEach(async () => {
  await fs.rm(workspacePath, { recursive: true, force: true });
});

// a task in the trash, and its row as archived
function trashedTask() {
  const task = tasks.createTask({ title: 'Ship', dueDate: DUE });
  archive.archiveTask(task.id);
  sent.mockClear();
  return tasks.getById(task.id, { includeArchived: true });
}

describe('assertNotTrashed', () => {
  it('passes an active row, and refuses one in the trash or with no row', () => {
    const task = tasks.createTask({ title: 'Ship' });
    expect(() => assertNotTrashed(db, task.id)).not.toThrow();
    archive.archiveTask(task.id);
    expect(() => assertNotTrashed(db, task.id)).toThrow(AlreadyArchivedError);
    expect(() => assertNotTrashed(db, generateId('task'))).toThrow(NotFoundError);
    expect(() => assertNotTrashed(db, generateId('project'))).toThrow(NotFoundError);
    expect(() => assertNotTrashed(db, generateId('note'))).toThrow(NotFoundError);
  });
});

describe('tasks in the trash', () => {
  it('refuses every write with AlreadyArchivedError, changing nothing', () => {
    const task = trashedTask();
    const active = tasks.createTask({ title: 'Other' });
    const project = projects.createProject({ title: 'Launch' });
    sent.mockClear();

    const writes: [string, () => unknown][] = [
      ['update', () => tasks.updateTask(task.id, { title: 'Renamed', dueDate: null })],
      ['status', () => tasks.updateStatus(task.id, TaskStatus.COMPLETED)],
      ['project', () => tasks.updateProject(task.id, project.id)],
      ['links', () => tasks.updateLinks(task.id, { linkedNoteId: null, linkedEventId: null })],
      ['promote', () => tasks.promoteSubtask(task.id)],
      ['demote', () => tasks.demoteTask(task.id, active.id)],
      ['demote under it', () => tasks.demoteTask(active.id, task.id)],
      ['subtask', () => tasks.createSubtask(task.id, { title: 'Part' })],
      ['convert', () => tasks.convertToProject(task.id)],
      ['favorite', () => favorites.favoriteTask(task.id)],
      ['unfavorite', () => favorites.unfavoriteTask(task.id)],
    ];
    for (const [name, write] of writes) {
      expect(write, name).toThrow(AlreadyArchivedError);
    }

    expect(tasks.getById(task.id, { includeArchived: true })).toEqual(task);
    expect(tasks.getById(active.id).parentTaskId).toBeNull();
    expect(sent).not.toHaveBeenCalled();
  });

  it('refuses a bulk update holding one, changing none of the tasks', () => {
    const task = trashedTask();
    const active = tasks.createTask({ title: 'Other' });
    sent.mockClear();

    expect(() => tasks.updateTasks([active.id, task.id], { priority: TaskPriority.HIGH })).toThrow(
      AlreadyArchivedError,
    );

    expect(tasks.getById(active.id).priority).toBe(TaskPriority.LOW);
    expect(sent).not.toHaveBeenCalled();
  });

  it('refuses a subtask archived with its parent', () => {
    const parent = tasks.createTask({ title: 'Ship' });
    const sub = tasks.createSubtask(parent.id, { title: 'Part' });
    archive.archiveTask(parent.id);

    expect(() => tasks.updateTask(sub.id, { title: 'Renamed' })).toThrow(AlreadyArchivedError);
    expect(() => tasks.updateStatus(sub.id, TaskStatus.COMPLETED)).toThrow(AlreadyArchivedError);
  });

  it('keeps a favorite it had, and takes writes again once restored', () => {
    const task = tasks.createTask({ title: 'Ship' });
    favorites.favoriteTask(task.id);
    archive.archiveTask(task.id);

    expect(() => favorites.unfavoriteTask(task.id)).toThrow(AlreadyArchivedError);
    expect(tasks.getById(task.id, { includeArchived: true }).favoritedAt).not.toBeNull();

    archive.restoreTask(task.id);
    expect(tasks.updateTask(task.id, { title: 'Renamed' }).title).toBe('Renamed');
    expect(tasks.updateStatus(task.id, TaskStatus.COMPLETED).status).toBe(TaskStatus.COMPLETED);
    expect(favorites.unfavoriteTask(task.id).favoritedAt).toBeNull();
  });

  it('still refuses an unknown task with NotFoundError', () => {
    const id = generateId('task');
    expect(() => tasks.updateTask(id, { title: 'x' })).toThrow(NotFoundError);
    expect(() => tasks.updateStatus(id, TaskStatus.COMPLETED)).toThrow(NotFoundError);
    expect(() => tasks.updateLinks(id, {})).toThrow(NotFoundError);
    expect(() => favorites.favoriteTask(id)).toThrow(NotFoundError);
  });
});

describe('projects in the trash', () => {
  it('refuses updates, status, dates, colour and favourites, changing nothing', () => {
    const created = projects.createProject({ title: 'Launch', color: '#ff0000' });
    archive.archiveProject(created.id);
    sent.mockClear();

    const writes: [string, () => unknown][] = [
      ['title', () => projects.updateProject(created.id, { title: 'Renamed' })],
      ['dates', () => projects.updateProject(created.id, { dueDate: DUE, startDate: DUE })],
      ['colour', () => projects.updateProject(created.id, { color: '#00ff00' })],
      ['status', () => projects.updateStatus(created.id, ProjectStatus.COMPLETED)],
      ['favorite', () => favorites.favoriteProject(created.id)],
      ['unfavorite', () => favorites.unfavoriteProject(created.id)],
    ];
    for (const [name, write] of writes) {
      expect(write, name).toThrow(AlreadyArchivedError);
    }
    expect(sent).not.toHaveBeenCalled();

    archive.restoreProject(created.id);
    expect(projects.getById(created.id)).toMatchObject({
      title: 'Launch',
      color: '#ff0000',
      status: ProjectStatus.NOT_STARTED,
      dueDate: null,
      favoritedAt: null,
    });
    expect(projects.updateProject(created.id, { color: '#00ff00' }).color).toBe('#00ff00');
  });

  it('refuses a write to a task archived with its project', () => {
    // a task archived with its project is in the trash too
    const project = projects.createProject({ title: 'Launch', tasks: [{ title: 'Ship' }] });
    const [task] = tasks.listTasks({ projectId: project.id }).items;
    archive.archiveProject(project.id);

    expect(() => tasks.updateProject(task.id, null)).toThrow(AlreadyArchivedError);
  });
});

describe('notes in the trash', () => {
  it('refuses a rename, new links, content and favourites, changing nothing', async () => {
    const note = await notes.createNote({ title: 'Plan', content: 'First' });
    const task = tasks.createTask({ title: 'Ship' });
    archive.archiveNote(note.id);
    sent.mockClear();

    expect(() => notes.updateNote(note.id, { title: 'Renamed' })).toThrow(AlreadyArchivedError);
    expect(() => notes.updateNote(note.id, { linkedTaskId: task.id })).toThrow(
      AlreadyArchivedError,
    );
    await expect(notes.updateNoteContent(note.id, 'Second')).rejects.toBeInstanceOf(
      AlreadyArchivedError,
    );
    expect(() => favorites.favoriteNote(note.id)).toThrow(AlreadyArchivedError);
    expect(() => favorites.unfavoriteNote(note.id)).toThrow(AlreadyArchivedError);
    expect(sent).not.toHaveBeenCalled();

    archive.restoreNote(note.id);
    expect(notes.getById(note.id)).toMatchObject({ title: 'Plan', linkedTaskId: null });
    expect(await notes.readContent(note.id)).toBe('First');
  });

  it('refuses a content save queued before the note went to the trash', async () => {
    const note = await notes.createNote({ title: 'Plan', content: 'First' });
    const first = notes.updateNoteContent(note.id, 'Second');
    const second = notes.updateNoteContent(note.id, 'Third');
    // the first save has read the row; the second runs after the archive
    archive.archiveNote(note.id);

    await expect(first).resolves.toMatchObject({ id: note.id });
    await expect(second).rejects.toBeInstanceOf(AlreadyArchivedError);
  });

  it('still refuses an unknown note with NotFoundError', async () => {
    const id = generateId('note');
    expect(() => notes.updateNote(id, { title: 'x' })).toThrow(NotFoundError);
    await expect(notes.updateNoteContent(id, 'x')).rejects.toBeInstanceOf(NotFoundError);
  });
});
