import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import { eq } from 'drizzle-orm';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { ProjectStatus, TaskStatus } from '@common/types';
import { calendars } from '@main/db/schema/calendars';
import { notes } from '@main/db/schema/notes';
import { tasks } from '@main/db/schema/tasks';
import { SearchService } from '../../search/service';
import { NoteService } from '../../notes/service';
import { TaskService } from '../../tasks/service';
import { ProjectService } from '../../projects/service';
import { EventService } from '../../events/service';
import { DEFAULT_CALENDAR_ID } from '../../calendars/types';
import { createDb } from '../utils';

// Each type's own search (tasks.search, notes.search, events.search): search's index joined to the
// type's table, so a picker gets the same rows as the type's list, filtered the same way and best
// match first.

const TOMORROW = new Date(Date.now() + 86_400_000);

let db: BetterSQLite3Database;
let workspacePath: string;
let searchService: SearchService;
let noteService: NoteService;
let taskService: TaskService;
let projectService: ProjectService;
let eventService: EventService;

beforeEach(async () => {
  db = createDb();
  workspacePath = await fs.mkdtemp(path.join(os.tmpdir(), 'devbrain-entity-search-'));
  searchService = new SearchService(db, workspacePath);
  noteService = new NoteService(db, workspacePath);
  taskService = new TaskService(db);
  projectService = new ProjectService(db, taskService);
  eventService = new EventService(db);
});

afterEach(async () => {
  await fs.rm(workspacePath, { recursive: true, force: true });
});

function task(title: string, description?: string) {
  const created = taskService.createTask({ title, description, dueDate: TOMORROW });
  searchService.indexTask(created);
  return created;
}

describe('TaskService.searchTasks', () => {
  it('returns the matching tasks as list rows, best match first', () => {
    const inBody = task('Release notes', 'mentions the widget once');
    const inTitle = task('Widget launch');
    task('Something else');

    const found = taskService.searchTasks('widget');
    expect(found.map(({ id }) => id)).toEqual([inTitle.id, inBody.id]);
    // a list row: its details are filled
    expect(found[0]).toMatchObject({ title: 'Widget launch', project: null, link: null });
  });

  it("applies the list's filter before the limit", () => {
    const parent = task('Widget parent');
    const subtask = taskService.createSubtask(parent.id, { title: 'Widget subtask' });
    searchService.indexTask(subtask);
    const done = task('Widget done');
    taskService.updateStatus(done.id, TaskStatus.COMPLETED);
    searchService.indexTask(taskService.getById(done.id));
    const open = task('Widget open');

    const found = taskService.searchTasks(
      'widget',
      { excludeSubtasks: true, excludeClosed: true },
      2,
    );
    expect(found.map(({ id }) => id).sort()).toEqual([parent.id, open.id].sort());
  });

  it('leaves out archived tasks, and finds nothing for a query with nothing to search', () => {
    const archived = task('Widget archived');
    db.update(tasks).set({ archivedAt: new Date() }).where(eq(tasks.id, archived.id)).run();

    expect(taskService.searchTasks('widget')).toEqual([]);
    expect(taskService.searchTasks('  ')).toEqual([]);
    expect(taskService.searchTasks('(')).toEqual([]);
  });

  it('finds only tasks, never another type with the same words', async () => {
    const note = await noteService.createNote({ title: 'Widget note' });
    await searchService.indexNote(note);

    expect(taskService.searchTasks('widget')).toEqual([]);
  });
});

describe('NoteService.searchNotes', () => {
  it('returns the matching unarchived notes as list rows', async () => {
    const kept = await noteService.createNote({ title: 'Widget plan' });
    const archived = await noteService.createNote({ title: 'Widget draft' });
    await searchService.indexNotes([kept, archived]);
    db.update(notes).set({ archivedAt: new Date() }).where(eq(notes.id, archived.id)).run();

    const found = noteService.searchNotes('widget');
    expect(found.map(({ id }) => id)).toEqual([kept.id]);
    expect(found[0]).toMatchObject({ title: 'Widget plan', project: null });
  });
});

describe('EventService.searchEvents', () => {
  it('returns matching events at any date, leaving out a hidden calendar’s', () => {
    const lastYear = new Date(Date.now() - 365 * 86_400_000);
    const old = eventService.createEvent({
      title: 'Widget review',
      startAt: lastYear,
      endAt: lastYear,
    });
    searchService.indexEvent(old);

    expect(eventService.searchEvents('widget').map(({ id }) => id)).toEqual([old.id]);

    db.update(calendars).set({ visible: false }).where(eq(calendars.id, DEFAULT_CALENDAR_ID)).run();
    expect(eventService.searchEvents('widget')).toEqual([]);
  });
});

describe('ProjectService.listProjects — excludeCompleted', () => {
  it('lists every project but the completed ones', () => {
    const open = projectService.createProject({ title: 'Open', dueDate: TOMORROW });
    const done = projectService.createProject({ title: 'Done', dueDate: TOMORROW });
    projectService.updateStatus(done.id, ProjectStatus.COMPLETED);

    const { items } = projectService.listProjects({ excludeCompleted: true });
    expect(items.map(({ id }) => id)).toEqual([open.id]);
  });
});
