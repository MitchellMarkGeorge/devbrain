import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import { createDb } from '../utils';
import { ArchiveService } from '../../archive/service';
import { NoteService } from '../../notes/service';
import { ProjectService } from '../../projects/service';
import { TaskService } from '../../tasks/service';

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

describe('ArchiveService — listArchived', () => {
  it('returns an empty list when nothing is archived', async () => {
    await tasks.createTask({ title: 'Active', dueDate: TOMORROW });
    await projects.createProject({ title: 'Active', dueDate: TOMORROW });
    await notesService.createNote({ title: 'Active' });

    expect(archive.listArchived()).toEqual([]);
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

    const result = archive.listArchived();
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

    const byId = new Map(archive.listArchived().map((entity) => [entity.id, entity]));
    expect(byId.get(task.id)?.entityType).toBe('task');
    expect(byId.get(project.id)?.entityType).toBe('project');
    expect(byId.get(note.id)?.entityType).toBe('note');
  });

  it('carries the title of each archived entity', async () => {
    const task = await tasks.createTask({ title: 'My task title', dueDate: TOMORROW });
    archive.archiveTask(task.id);

    const [entity] = archive.listArchived();
    expect(entity.title).toBe('My task title');
  });

  it('decodes archivedAt as a Date', async () => {
    const task = await tasks.createTask({ title: 'T', dueDate: TOMORROW });
    const archived = archive.archiveTask(task.id);

    const [entity] = archive.listArchived();
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

    const result = archive.listArchived();
    expect(result.map((entity) => entity.id)).toEqual([note.id, task.id, project.id]);
  });

  it('excludes entities that have been restored', async () => {
    const task = await tasks.createTask({ title: 'Restored', dueDate: TOMORROW });
    const stillArchived = await tasks.createTask({ title: 'Still archived', dueDate: TOMORROW });

    archive.archiveTask(task.id);
    archive.archiveTask(stillArchived.id);
    archive.restoreTask(task.id);

    expect(archive.listArchived().map((entity) => entity.id)).toEqual([stillArchived.id]);
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

    const ids = archive.listArchived().map((entity) => entity.id);
    expect(ids).toHaveLength(3);
    expect(ids).toContain(project.id);
    expect(ids).toContain(task.id);
    expect(ids).toContain(note.id);
  });
});
