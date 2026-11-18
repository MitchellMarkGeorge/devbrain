import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import { TaskStatus, type StampedId } from '@common/types';
import { createDb } from '../utils';
import { ArchiveService } from '../../archive/service';
import { EventService } from '../../events/service';
import { NoteService } from '../../notes/service';
import { ProjectService } from '../../projects/service';
import { TaskService } from '../../tasks/service';

const TOMORROW = new Date(Date.now() + 24 * 60 * 60 * 1000);

let db: BetterSQLite3Database;
let workspacePath: string;
let tasks: TaskService;
let projects: ProjectService;
let notes: NoteService;
let events: EventService;
let archive: ArchiveService;

beforeEach(async () => {
  db = createDb();
  workspacePath = await fs.mkdtemp(path.join(os.tmpdir(), 'devbrain-mentions-'));
  tasks = new TaskService(db);
  projects = new ProjectService(db, tasks);
  notes = new NoteService(db, workspacePath);
  events = new EventService(db);
  archive = new ArchiveService(db);
});

afterEach(async () => {
  await fs.rm(workspacePath, { recursive: true, force: true });
});

describe('NoteService.mentions', () => {
  it('gives each entity as a pill draws it, of every type, in the order asked', async () => {
    const project = projects.createProject({
      title: 'Apollo',
      dueDate: TOMORROW,
      color: '#22c55e',
    });
    const task = tasks.createTask({
      title: 'Launch',
      dueDate: TOMORROW,
      status: TaskStatus.IN_PROGRESS,
    });
    const note = await notes.createNote({ title: 'Plan' });
    const event = events.createEvent({
      title: 'Review',
      startAt: new Date('2026-06-10T10:00:00.000Z'),
      endAt: new Date('2026-06-10T11:00:00.000Z'),
    });

    const summaries = notes.mentions([event.id, note.id, task.id, project.id, task.id]);

    expect(summaries).toEqual([
      expect.objectContaining({ type: 'event', id: event.id, title: 'Review' }),
      { type: 'note', id: note.id, title: 'Plan' },
      { type: 'task', id: task.id, title: 'Launch', status: TaskStatus.IN_PROGRESS },
      { type: 'project', id: project.id, title: 'Apollo', color: '#22c55e' },
    ]);
    // an event's colour, its own or else its calendar's (shared/summaries)
    expect(summaries[0]).toHaveProperty('color');
  });

  it('leaves out an id of no entity and an archived one', () => {
    const kept = tasks.createTask({ title: 'Kept', dueDate: TOMORROW });
    const trashed = tasks.createTask({ title: 'Trashed', dueDate: TOMORROW });
    archive.archiveTask(trashed.id);

    expect(
      notes.mentions([kept.id, trashed.id, 'tsk_missing' as StampedId]).map(({ id }) => id),
    ).toEqual([kept.id]);
    expect(notes.mentions([])).toEqual([]);
  });
});
