import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { eq } from 'drizzle-orm';
import type { ExternalSourceId, TaskId } from '@common/ids';
import {
  AuthType,
  LinkState,
  ProjectStatus,
  Provider,
  SourceType,
  TaskPriority,
  TaskStatus,
} from '@common/types';
import { integrations, externalSources, externalLinks } from '@main/db/schema/integrations';
import { tasks as tasksTable } from '@main/db/schema/tasks';
import { notes as notesTable } from '@main/db/schema/notes';
import { createDb } from '../utils';
import { TaskChange, TaskService } from '../../tasks/service';
import { ProjectChange, ProjectService } from '../../projects/service';
import { NoteChange, NoteService } from '../../notes/service';
import { ArchiveService } from '../../archive/service';
import { FavoritesService } from '../../favorites/service';
import { EventService } from '../../events/service';
import { ExternalReadOnlyError, NotFoundError } from '../../shared/errors';
import { readNoteFile } from '../../local/notes';

// C1–C3: convert a task to a project, duplicate a task or note, copy a task, project or note as
// Markdown.

const START = new Date(2026, 10, 2);
const DUE = new Date(2026, 10, 9);

let db: BetterSQLite3Database;
let tasks: TaskService;
let projects: ProjectService;
let notes: NoteService;
let archive: ArchiveService;
let favorites: FavoritesService;
let workspacePath: string;
let sourceId: ExternalSourceId;
let linkCount = 0;

function linkTask(taskId: TaskId, state: LinkState = LinkState.SYNCED) {
  linkCount += 1;
  db.insert(externalLinks)
    .values({
      sourceId,
      provider: Provider.LINEAR,
      externalId: `item-${linkCount}`,
      externalKey: `ENG-${linkCount}`,
      externalUrl: `https://linear.app/acme/issue/ENG-${linkCount}`,
      externalUpdatedAt: START,
      lastSyncedAt: START,
      state,
      taskId,
    })
    .run();
}

function row(id: TaskId) {
  return db.select().from(tasksTable).where(eq(tasksTable.id, id)).get()!;
}

beforeEach(async () => {
  db = createDb();
  tasks = new TaskService(db);
  projects = new ProjectService(db);
  archive = new ArchiveService(db);
  favorites = new FavoritesService(db);
  workspacePath = await fs.mkdtemp(path.join(os.tmpdir(), 'devbrain-convert-'));
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

describe('TaskService.convertToProject', () => {
  it('makes a project from the task, moves its subtasks and note, and archives it', async () => {
    const home = projects.createProject({ title: 'Home', color: '#ff0000' });
    const event = new EventService(db).createEvent({
      title: 'Kickoff',
      startAt: START,
      endAt: DUE,
    });
    const task = tasks.createTask({
      title: 'Auth overhaul',
      description: 'Replace **OAuth**',
      status: TaskStatus.IN_PROGRESS,
      startDate: START,
      dueDate: DUE,
      projectId: home.id,
      linkedEventId: event.id,
    });
    favorites.favoriteTask(task.id);
    const first = tasks.createSubtask(task.id, { title: 'PKCE' });
    const nested = tasks.createSubtask(first.id, { title: 'Verifier' });
    const second = tasks.createSubtask(task.id, { title: 'Fallback' });
    const trashed = tasks.createSubtask(task.id, { title: 'Dropped' });
    archive.archiveTask(trashed.id);
    const note = await notes.createNote({ title: 'Plan', linkedTaskId: task.id });
    const other = await notes.createNote({ title: 'Unrelated' });

    const changes: TaskChange[] = [];
    tasks.onChange((change) => changes.push(change));
    const project = tasks.convertToProject(task.id);

    expect(project).toMatchObject({
      title: 'Auth overhaul',
      description: 'Replace **OAuth**',
      startDate: START,
      dueDate: DUE,
      color: '#ff0000',
      status: ProjectStatus.ACTIVE,
      archivedAt: null,
      external: null,
    });
    // the favorite moved to the project
    expect(project.favoritedAt).not.toBeNull();
    expect(projects.getById(project.id).favoritedAt).toEqual(project.favoritedAt);

    // the subtasks are top-level tasks of the project, keeping the link they took from the task;
    // theirs stay under them
    for (const id of [first.id, second.id]) {
      expect(row(id)).toMatchObject({
        parentTaskId: null,
        projectId: project.id,
        linkedEventId: event.id,
        archivedAt: null,
      });
    }
    expect(row(nested.id)).toMatchObject({ parentTaskId: first.id, projectId: project.id });
    // an archived subtask stays with the task, in the trash
    expect(row(trashed.id)).toMatchObject({ parentTaskId: task.id, projectId: home.id });

    // the task note is the project's, and no task's
    expect(notes.getById(note.id)).toMatchObject({ projectId: project.id, linkedTaskId: null });
    expect(notes.getById(other.id)).toMatchObject({ projectId: null });

    // the task is in the trash, keeping its link and project, without its favorite
    expect(row(task.id)).toMatchObject({
      linkedEventId: event.id,
      projectId: home.id,
      favoritedAt: null,
    });
    expect(row(task.id).archivedAt).not.toBeNull();
    expect(() => tasks.getById(task.id)).toThrow(NotFoundError);

    expect(changes).toHaveLength(1);
    const [change] = changes;
    expect(change.type).toBe('converted');
    if (change.type !== 'converted') return;
    expect(change.project.id).toBe(project.id);
    expect(change.task.id).toBe(task.id);
    expect(change.task.archivedAt).not.toBeNull();
    expect(change.movedTasks.map((moved) => moved.id).sort()).toEqual([first.id, second.id].sort());
    expect(change.note?.id).toBe(note.id);
  });

  it('restoring the task brings it back without its subtasks or note', async () => {
    const task = tasks.createTask({ title: 'Task' });
    const subtask = tasks.createSubtask(task.id, { title: 'Sub' });
    const note = await notes.createNote({ title: 'Note', linkedTaskId: task.id });
    const project = tasks.convertToProject(task.id);

    archive.restoreTask(task.id);
    expect(tasks.getById(task.id).archivedAt).toBeNull();
    expect(row(subtask.id)).toMatchObject({ parentTaskId: null, projectId: project.id });
    expect(notes.getById(note.id)).toMatchObject({ linkedTaskId: null, projectId: project.id });
  });

  it('archiving the new project takes the moved tasks and the note with it', async () => {
    const task = tasks.createTask({ title: 'Task' });
    const subtask = tasks.createSubtask(task.id, { title: 'Sub' });
    const note = await notes.createNote({ title: 'Note', linkedTaskId: task.id });
    const project = tasks.convertToProject(task.id);

    const changed = archive.archiveProject(project.id);
    expect(changed.archivedAt).not.toBeNull();
    expect(row(subtask.id).archivedAt).not.toBeNull();
    const noteRow = db.select().from(notesTable).where(eq(notesTable.id, note.id)).get()!;
    expect(noteRow.archivedAt).not.toBeNull();
  });

  it('maps the status, and a task with no project or note makes a plain project', () => {
    const done = tasks.createTask({ title: 'Done', status: TaskStatus.COMPLETED });
    expect(tasks.convertToProject(done.id)).toMatchObject({
      status: ProjectStatus.COMPLETED,
      color: null,
      favoritedAt: null,
    });
    const cancelled = tasks.createTask({ title: 'Dropped', status: TaskStatus.CANCELLED });
    expect(tasks.convertToProject(cancelled.id).status).toBe(ProjectStatus.ON_HOLD);
    const fresh = tasks.createTask({ title: 'Fresh' });
    const project = tasks.convertToProject(fresh.id);
    expect(project).toMatchObject({ status: ProjectStatus.NOT_STARTED, completedAt: null });
    expect(projects.getProjectStats(project.id).totalTasks).toBe(0);
  });

  it('converts a subtask, which leaves its parent', () => {
    const parent = tasks.createTask({ title: 'Parent' });
    const subtask = tasks.createSubtask(parent.id, { title: 'Sub' });
    const project = tasks.convertToProject(subtask.id);
    expect(project.title).toBe('Sub');
    expect(tasks.listSubtasks(parent.id).items).toEqual([]);
  });

  it('refuses a synced task and changes nothing; a detached one converts', () => {
    const synced = tasks.createTask({ title: 'Synced' });
    linkTask(synced.id);
    expect(() => tasks.convertToProject(synced.id)).toThrow(ExternalReadOnlyError);
    expect(row(synced.id).archivedAt).toBeNull();
    expect(projects.listProjects().items).toEqual([]);

    const detached = tasks.createTask({ title: 'Detached' });
    linkTask(detached.id, LinkState.DETACHED);
    expect(tasks.convertToProject(detached.id).title).toBe('Detached');
  });

  it('throws NotFoundError for an unknown or archived task', () => {
    const task = tasks.createTask({ title: 'Task' });
    archive.archiveTask(task.id);
    expect(() => tasks.convertToProject(task.id)).toThrow(NotFoundError);
    expect(() => tasks.convertToProject('tsk_missing' as TaskId)).toThrow(NotFoundError);
  });
});

describe('TaskService.duplicateTask', () => {
  it('copies the task and its active subtree, titling only the copy', () => {
    const project = projects.createProject({ title: 'Project' });
    const task = tasks.createTask({
      title: 'Write docs',
      description: 'All of them',
      priority: TaskPriority.HIGH,
      status: TaskStatus.COMPLETED,
      startDate: START,
      dueDate: DUE,
      projectId: project.id,
      pullRequestUrl: 'https://github.com/acme/app/pull/1',
    });
    favorites.favoriteTask(task.id);
    const sub = tasks.createSubtask(task.id, { title: 'Outline' });
    tasks.createSubtask(sub.id, { title: 'Headings' });
    const trashed = tasks.createSubtask(task.id, { title: 'Trashed' });
    archive.archiveTask(trashed.id);

    const changes: TaskChange[] = [];
    tasks.onChange((change) => changes.push(change));
    const copy = tasks.duplicateTask(task.id);

    expect(copy).toMatchObject({
      title: 'Copy of Write docs',
      description: 'All of them',
      priority: TaskPriority.HIGH,
      status: TaskStatus.COMPLETED,
      completedAt: task.completedAt,
      startDate: START,
      dueDate: DUE,
      projectId: project.id,
      pullRequestUrl: 'https://github.com/acme/app/pull/1',
      parentTaskId: null,
      favoritedAt: null,
      external: null,
    });
    expect(copy.id).not.toBe(task.id);
    const [copiedSub] = tasks.listSubtasks(copy.id).items;
    expect(copiedSub).toMatchObject({ title: 'Outline' });
    expect(copiedSub.id).not.toBe(sub.id);
    expect(tasks.listSubtasks(copiedSub.id).items.map((t) => t.title)).toEqual(['Headings']);
    // the original is untouched
    expect(tasks.listSubtasks(task.id).items.map((t) => t.title)).toEqual(['Outline']);

    expect(changes.map((change) => change.type)).toEqual(['created', 'created', 'created']);
    expect(changes[0]).toMatchObject({ task: { id: copy.id } });
  });

  it('keeps the link and leaves the task note behind', async () => {
    const source = await notes.createNote({ title: 'Source' });
    const task = tasks.createTask({ title: 'From a note', linkedNoteId: source.id });
    await notes.createNote({ title: 'Task note', linkedTaskId: task.id });
    const copy = tasks.duplicateTask(task.id);
    expect(copy.linkedNoteId).toBe(source.id);
    expect(notes.listNotes({ linkedTaskId: copy.id }).items).toEqual([]);
  });

  it('puts a subtask’s copy under the same parent', () => {
    const parent = tasks.createTask({ title: 'Parent' });
    const sub = tasks.createSubtask(parent.id, { title: 'Sub' });
    const copy = tasks.duplicateTask(sub.id);
    expect(copy.parentTaskId).toBe(parent.id);
    expect(tasks.listSubtasks(parent.id).items).toHaveLength(2);
  });

  it('copies a synced task and its subtree as local tasks, top-level under a synced parent', () => {
    const parent = tasks.createTask({ title: 'Synced parent' });
    linkTask(parent.id);
    const child = db
      .insert(tasksTable)
      .values({ title: 'Synced child', parentTaskId: parent.id })
      .returning()
      .get();
    linkTask(child.id);
    db.insert(tasksTable).values({ title: 'Synced grandchild', parentTaskId: child.id }).run();

    const copy = tasks.duplicateTask(child.id);
    expect(copy).toMatchObject({
      title: 'Copy of Synced child',
      parentTaskId: null,
      external: null,
    });
    expect(tasks.getById(copy.id).external).toBeNull();
    const [grandchild] = tasks.listSubtasks(copy.id).items;
    expect(grandchild).toMatchObject({ title: 'Synced grandchild', external: null });

    const parentCopy = tasks.duplicateTask(parent.id);
    expect(parentCopy.external).toBeNull();
    // a local copy can be edited
    expect(tasks.updateTask(parentCopy.id, { title: 'Mine' }).title).toBe('Mine');
  });

  it('throws NotFoundError for an unknown or archived task', () => {
    const task = tasks.createTask({ title: 'Task' });
    archive.archiveTask(task.id);
    expect(() => tasks.duplicateTask(task.id)).toThrow(NotFoundError);
    expect(() => tasks.duplicateTask('tsk_missing' as TaskId)).toThrow(NotFoundError);
  });
});

describe('NoteService.duplicateNote', () => {
  it('copies the row and the file, keeping the project but not the event link', async () => {
    const project = projects.createProject({ title: 'Project' });
    const event = new EventService(db).createEvent({
      title: 'Standup',
      startAt: START,
      endAt: DUE,
    });
    const note = await notes.createNote({
      title: 'Minutes',
      projectId: project.id,
      linkedEventId: event.id,
      content: '# Agenda\n\n- [ ] Ship',
    });
    const changes: NoteChange[] = [];
    notes.onChange((change) => changes.push(change));

    const copy = await notes.duplicateNote(note.id);
    expect(copy).toMatchObject({
      title: 'Copy of Minutes',
      projectId: project.id,
      // an event has one note, the original
      linkedEventId: null,
      linkedTaskId: null,
      preview: note.preview,
    });
    expect(copy.id).not.toBe(note.id);
    expect(await notes.readContent(copy.id)).toBe('# Agenda\n\n- [ ] Ship');
    const file = await readNoteFile(path.join(workspacePath, 'notes', `${copy.id}.md`));
    expect(file.content).toBe('# Agenda\n\n- [ ] Ship');
    expect(changes).toEqual([{ type: 'created', note: copy, content: '# Agenda\n\n- [ ] Ship' }]);
  });

  it('leaves a task note’s copy linked to no task, and an untitled note untitled', async () => {
    const task = tasks.createTask({ title: 'Task' });
    const note = await notes.createNote({ linkedTaskId: task.id });
    const copy = await notes.duplicateNote(note.id);
    expect(copy).toMatchObject({ title: '', linkedTaskId: null });
  });

  it('copies the content of a save still in flight', async () => {
    const note = await notes.createNote({ title: 'Draft', content: 'old' });
    const save = notes.updateNoteContent(note.id, 'new');
    const copy = await notes.duplicateNote(note.id);
    await save;
    expect(await notes.readContent(copy.id)).toBe('new');
  });

  it('removes the copied file when the row fails, and throws NotFoundError for a missing note', async () => {
    const note = await notes.createNote({ title: 'Note', content: 'body' });
    const before = await fs.readdir(path.join(workspacePath, 'notes'));
    // the row's insert fails
    vi.spyOn(db, 'transaction').mockImplementationOnce(() => {
      throw new Error('disk full');
    });
    await expect(notes.duplicateNote(note.id)).rejects.toThrow('disk full');
    expect(await fs.readdir(path.join(workspacePath, 'notes'))).toEqual(before);

    await expect(notes.duplicateNote('nte_missing' as never)).rejects.toThrow(NotFoundError);
  });
});

describe('toMarkdown', () => {
  it('writes a task with its properties and its subtasks as a checklist', () => {
    const project = projects.createProject({ title: 'Auth' });
    const task = tasks.createTask({
      title: 'Ship PKCE',
      description: 'Use **S256**.\n',
      status: TaskStatus.IN_PROGRESS,
      priority: TaskPriority.HIGH,
      startDate: START,
      dueDate: DUE,
      projectId: project.id,
      pullRequestUrl: 'https://github.com/acme/app/pull/7',
    });
    const first = tasks.createSubtask(task.id, { title: 'Verifier', status: TaskStatus.COMPLETED });
    tasks.createSubtask(first.id, { title: 'Length check' });
    tasks.createSubtask(task.id, { title: 'Old flow', status: TaskStatus.CANCELLED });
    const trashed = tasks.createSubtask(task.id, { title: 'Trashed' });
    archive.archiveTask(trashed.id);

    expect(tasks.toMarkdown(task.id)).toBe(
      [
        '# Ship PKCE',
        '',
        '- **Status:** In progress',
        '- **Priority:** High',
        '- **Start:** 2026-11-02',
        '- **Due:** 2026-11-09',
        '- **Project:** Auth',
        '- **Pull request:** https://github.com/acme/app/pull/7',
        '',
        'Use **S256**.',
        '',
        '## Subtasks',
        '',
        '- [x] Verifier',
        '  - [ ] Length check',
        '- [ ] ~~Old flow~~',
        '',
      ].join('\n'),
    );
  });

  it('writes a bare task as its title and properties', () => {
    const task = tasks.createTask({ title: 'Quick' });
    expect(tasks.toMarkdown(task.id)).toBe(
      '# Quick\n\n- **Status:** Not started\n- **Priority:** Low\n',
    );
  });

  it('writes a project with its tasks grouped by status', () => {
    const project = projects.createProject({
      title: 'Launch',
      description: 'The **v1** launch',
      status: ProjectStatus.ACTIVE,
      dueDate: DUE,
    });
    const started = tasks.createTask({
      title: 'Landing page',
      projectId: project.id,
      status: TaskStatus.IN_PROGRESS,
    });
    // a subtask stays under its parent whatever its status
    tasks.createSubtask(started.id, { title: 'Copy', status: TaskStatus.COMPLETED });
    tasks.createTask({ title: 'Pricing', projectId: project.id });
    tasks.createTask({ title: 'Domain', projectId: project.id, status: TaskStatus.COMPLETED });
    const trashed = tasks.createTask({ title: 'Trashed', projectId: project.id });
    archive.archiveTask(trashed.id);
    tasks.createTask({ title: 'Elsewhere' });

    expect(projects.toMarkdown(project.id)).toBe(
      [
        '# Launch',
        '',
        '- **Status:** Active',
        '- **Due:** 2026-11-09',
        '',
        'The **v1** launch',
        '',
        '## Not started',
        '',
        '- [ ] Pricing',
        '',
        '## In progress',
        '',
        '- [ ] Landing page',
        '  - [x] Copy',
        '',
        '## Completed',
        '',
        '- [x] Domain',
        '',
      ].join('\n'),
    );
  });

  it('writes a note as its title and content', async () => {
    const note = await notes.createNote({
      title: 'Minutes',
      content: 'Shipped it.\n\n- [x] Ship\n',
    });
    expect(await notes.toMarkdown(note.id)).toBe('# Minutes\n\nShipped it.\n\n- [x] Ship\n');
    const empty = await notes.createNote({});
    expect(await notes.toMarkdown(empty.id)).toBe('# Untitled\n');
  });

  it('throws NotFoundError for an archived or unknown entity, and changes nothing', async () => {
    const task = tasks.createTask({ title: 'Task' });
    const project = projects.createProject({ title: 'Project' });
    const note = await notes.createNote({ title: 'Note' });
    const changes: (TaskChange | ProjectChange | NoteChange)[] = [];
    tasks.onChange((change) => changes.push(change));
    projects.onChange((change) => changes.push(change));
    notes.onChange((change) => changes.push(change));
    tasks.toMarkdown(task.id);
    projects.toMarkdown(project.id);
    await notes.toMarkdown(note.id);
    expect(changes).toEqual([]);

    archive.archiveTask(task.id);
    archive.archiveProject(project.id);
    expect(() => tasks.toMarkdown(task.id)).toThrow(NotFoundError);
    expect(() => projects.toMarkdown(project.id)).toThrow(NotFoundError);
    await expect(notes.toMarkdown('nte_missing' as never)).rejects.toThrow(NotFoundError);
  });
});
