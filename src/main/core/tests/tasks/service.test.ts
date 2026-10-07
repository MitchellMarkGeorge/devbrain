import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { generateId, ProjectId, NoteId, EventId } from '@common/ids';
import { TaskService } from '../../tasks/service';
import { ArchiveService } from '../../archive/service';
import { NoteService } from '../../notes/service';
import { ProjectService } from '../../projects/service';
import { EventService } from '../../events/service';
import { TaskPriority, TaskStatus } from '../../tasks/types';
import { AlreadyArchivedError, NotArchivedError, NotFoundError } from '../../shared/errors';
import { tasks as tasksTable } from '@main/db/schema/tasks';
import { eq } from 'drizzle-orm';
import { createDb } from '../utils';
import { InvalidCursorError } from '../../shared/pagination';

let FAKE_PROJECT_ID: ProjectId;
let FAKE_NOTE_ID: NoteId;
let FAKE_OTHER_NOTE_ID: NoteId;
let FAKE_EVENT_ID: EventId;
let FAKE_OTHER_EVENT_ID: EventId;

const TOMORROW = new Date(Date.now() + 86_400_000);
const YESTERDAY = new Date(Date.now() - 86_400_000);
const NEXT_WEEK = new Date(Date.now() + 7 * 86_400_000);

let db: BetterSQLite3Database;
let tasks: TaskService;
let archive: ArchiveService;
let notesService: NoteService;
let workspacePath: string;

beforeEach(async () => {
  db = createDb();
  tasks = new TaskService(db);
  archive = new ArchiveService(db);
  workspacePath = await fs.mkdtemp(path.join(os.tmpdir(), 'devbrain-tasks-service-'));
  notesService = new NoteService(db, workspacePath);

  const projectService = new ProjectService(db);
  const eventService = new EventService(db);

  FAKE_PROJECT_ID = (
    await projectService.createProject({ title: 'Fake Project', dueDate: TOMORROW })
  ).id;
  FAKE_NOTE_ID = (await notesService.createNote({ title: 'Fake Note' })).id;
  FAKE_OTHER_NOTE_ID = (await notesService.createNote({ title: 'Fake Other Note' })).id;
  FAKE_EVENT_ID = (
    await eventService.createEvent({ title: 'Fake Event', startAt: TOMORROW, endAt: TOMORROW })
  ).id;
  FAKE_OTHER_EVENT_ID = (
    await eventService.createEvent({
      title: 'Fake Other Event',
      startAt: TOMORROW,
      endAt: TOMORROW,
    })
  ).id;
});

afterEach(async () => {
  await fs.rm(workspacePath, { recursive: true, force: true });
});

describe('TaskService — createTask', () => {
  it('creates a task and returns it with an assigned id', async () => {
    const task = await tasks.createTask({ title: 'Buy milk', dueDate: TOMORROW });
    expect(task.id).toBeTruthy();
    expect(task.title).toBe('Buy milk');
  });

  it('defaults status to NOT_STARTED', async () => {
    const task = await tasks.createTask({ title: 'Default status', dueDate: TOMORROW });
    expect(task.status).toBe(TaskStatus.NOT_STARTED);
  });

  it('defaults priority to LOW', async () => {
    const task = await tasks.createTask({ title: 'Default priority', dueDate: TOMORROW });
    expect(task.priority).toBe(TaskPriority.LOW);
  });

  it('accepts explicit status and priority overrides', async () => {
    const task = await tasks.createTask({
      title: 'Explicit',
      dueDate: TOMORROW,
      status: TaskStatus.IN_PROGRESS,
      priority: TaskPriority.HIGH,
    });
    expect(task.status).toBe(TaskStatus.IN_PROGRESS);
    expect(task.priority).toBe(TaskPriority.HIGH);
  });

  it('sets completedAt when created with COMPLETED status', async () => {
    const before = new Date();
    const task = await tasks.createTask({
      title: 'Already done',
      dueDate: TOMORROW,
      status: TaskStatus.COMPLETED,
    });
    const after = new Date();
    expect(task.completedAt).not.toBeNull();
    expect(task.completedAt!.getTime()).toBeGreaterThanOrEqual(before.getTime());
    expect(task.completedAt!.getTime()).toBeLessThanOrEqual(after.getTime());
  });

  it('leaves completedAt null for non-COMPLETED status', async () => {
    const notStarted = await tasks.createTask({ title: 'Not started', dueDate: TOMORROW });
    const inProgress = await tasks.createTask({
      title: 'In progress',
      dueDate: TOMORROW,
      status: TaskStatus.IN_PROGRESS,
    });
    expect(notStarted.completedAt).toBeNull();
    expect(inProgress.completedAt).toBeNull();
  });

  it('throws when both linkedEventId and linkedNoteId are provided', async () => {
    await expect(
      tasks.createTask({
        title: 'Double linked',
        dueDate: TOMORROW,
        linkedEventId: FAKE_EVENT_ID,
        linkedNoteId: FAKE_NOTE_ID,
      }),
    ).rejects.toThrow('Tasks cannot be linked to both an event and a note');
  });

  it('creates a task linked only to a note', async () => {
    const task = await tasks.createTask({
      title: 'Note task',
      dueDate: TOMORROW,
      linkedNoteId: FAKE_NOTE_ID,
    });
    expect(task.linkedNoteId).toBe(FAKE_NOTE_ID);
    expect(task.linkedEventId).toBeNull();
  });

  it('creates a task linked only to an event', async () => {
    const task = await tasks.createTask({
      title: 'Event task',
      dueDate: TOMORROW,
      linkedEventId: FAKE_EVENT_ID,
    });
    expect(task.linkedEventId).toBe(FAKE_EVENT_ID);
    expect(task.linkedNoteId).toBeNull();
  });

  it('sets parentTaskId to null for top-level tasks', async () => {
    const task = await tasks.createTask({ title: 'Top level', dueDate: TOMORROW });
    expect(task.parentTaskId).toBeNull();
  });

  it('stores the provided description', async () => {
    const task = await tasks.createTask({
      title: 'With description',
      dueDate: TOMORROW,
      description: 'Some notes',
    });
    expect(task.description).toBe('Some notes');
  });

  it('stores the provided projectId', async () => {
    const task = await tasks.createTask({
      title: 'In project',
      dueDate: TOMORROW,
      projectId: FAKE_PROJECT_ID,
    });
    expect(task.projectId).toBe(FAKE_PROJECT_ID);
  });
});

describe('TaskService — createSubtask', () => {
  it('creates a subtask linked to the parent', async () => {
    const parent = await tasks.createTask({ title: 'Parent', dueDate: TOMORROW });
    const sub = await tasks.createSubtask(parent.id, { title: 'Subtask' });
    expect(sub.parentTaskId).toBe(parent.id);
  });

  it('throws NotFoundError when parent does not exist', async () => {
    await expect(
      tasks.createSubtask(generateId('task'), { title: 'Orphan' }),
    ).rejects.toBeInstanceOf(NotFoundError);
  });

  it('throws when trying to add a subtask to a subtask', async () => {
    const parent = await tasks.createTask({ title: 'Parent', dueDate: TOMORROW });
    const child = await tasks.createSubtask(parent.id, { title: 'Child' });
    await expect(tasks.createSubtask(child.id, { title: 'Grandchild' })).rejects.toThrow(
      'Subtasks cannot create their own subtasks',
    );
  });

  it("inherits the parent's dueDate when none is provided", async () => {
    const parent = await tasks.createTask({ title: 'Parent', dueDate: TOMORROW });
    const sub = await tasks.createSubtask(parent.id, { title: 'Sub' });
    expect(sub.dueDate!.getTime()).toBe(parent.dueDate!.getTime());
  });

  it('uses its own dueDate when one is provided', async () => {
    const parent = await tasks.createTask({ title: 'Parent', dueDate: TOMORROW });
    const sub = await tasks.createSubtask(parent.id, { title: 'Sub', dueDate: NEXT_WEEK });
    expect(sub.dueDate!.getTime()).toBe(NEXT_WEEK.getTime());
  });

  it("inherits the parent's projectId", async () => {
    const parent = await tasks.createTask({
      title: 'Parent',
      dueDate: TOMORROW,
      projectId: FAKE_PROJECT_ID,
    });
    const sub = await tasks.createSubtask(parent.id, { title: 'Sub' });
    expect(sub.projectId).toBe(FAKE_PROJECT_ID);
  });

  it("inherits the parent's linkedNoteId", async () => {
    const parent = await tasks.createTask({
      title: 'Parent',
      dueDate: TOMORROW,
      linkedNoteId: FAKE_NOTE_ID,
    });
    const sub = await tasks.createSubtask(parent.id, { title: 'Sub' });
    expect(sub.linkedNoteId).toBe(FAKE_NOTE_ID);
  });

  it("inherits the parent's linkedEventId", async () => {
    const parent = await tasks.createTask({
      title: 'Parent',
      dueDate: TOMORROW,
      linkedEventId: FAKE_EVENT_ID,
    });
    const sub = await tasks.createSubtask(parent.id, { title: 'Sub' });
    expect(sub.linkedEventId).toBe(FAKE_EVENT_ID);
  });

  it('sets completedAt when created with COMPLETED status', async () => {
    const parent = await tasks.createTask({ title: 'Parent', dueDate: TOMORROW });
    const sub = await tasks.createSubtask(parent.id, {
      title: 'Done sub',
      status: TaskStatus.COMPLETED,
    });
    expect(sub.completedAt).not.toBeNull();
  });

  it('defaults status and priority when not provided', async () => {
    const parent = await tasks.createTask({ title: 'Parent', dueDate: TOMORROW });
    const sub = await tasks.createSubtask(parent.id, { title: 'Sub' });
    expect(sub.status).toBe(TaskStatus.NOT_STARTED);
    expect(sub.priority).toBe(TaskPriority.LOW);
  });
});

describe('TaskService — getById', () => {
  it('returns the task for a valid id', async () => {
    const created = await tasks.createTask({ title: 'Find me', dueDate: TOMORROW });
    const found = await tasks.getById(created.id);
    expect(found.id).toBe(created.id);
    expect(found.title).toBe('Find me');
  });

  it('throws NotFoundError for an unknown id', async () => {
    await expect(tasks.getById(generateId('task'))).rejects.toBeInstanceOf(NotFoundError);
  });

  it('throws NotFoundError for an archived task', async () => {
    const task = await tasks.createTask({ title: 'Soon archived', dueDate: TOMORROW });
    archive.archiveTask(task.id);
    await expect(tasks.getById(task.id)).rejects.toBeInstanceOf(NotFoundError);
  });
});

describe('TaskService — getByIds', () => {
  it('returns all tasks matching the provided ids', async () => {
    const a = await tasks.createTask({ title: 'A', dueDate: TOMORROW });
    const b = await tasks.createTask({ title: 'B', dueDate: TOMORROW });
    await tasks.createTask({ title: 'C', dueDate: TOMORROW }); // not requested
    const result = await tasks.getByIds([a.id, b.id]);
    expect(result).toHaveLength(2);
    const ids = result.map((t) => t.id);
    expect(ids).toContain(a.id);
    expect(ids).toContain(b.id);
  });

  it('returns an empty array when none of the ids match', async () => {
    const result = await tasks.getByIds([generateId('task'), generateId('task')]);
    expect(result).toHaveLength(0);
  });

  it('excludes archived tasks even when their id is requested', async () => {
    const task = await tasks.createTask({ title: 'Archived', dueDate: TOMORROW });
    archive.archiveTask(task.id);
    const result = await tasks.getByIds([task.id]);
    expect(result).toHaveLength(0);
  });
});

describe('TaskService — listTasks', () => {
  it('returns all non-archived tasks regardless of status by default', async () => {
    const notStarted = await tasks.createTask({ title: 'A', dueDate: TOMORROW });
    const inProgress = await tasks.createTask({
      title: 'B',
      dueDate: TOMORROW,
      status: TaskStatus.IN_PROGRESS,
    });
    const completed = await tasks.createTask({
      title: 'C',
      dueDate: TOMORROW,
      status: TaskStatus.COMPLETED,
    });
    const archived = await tasks.createTask({ title: 'D', dueDate: TOMORROW });
    archive.archiveTask(archived.id);

    const result = (await tasks.listTasks()).items;
    const ids = result.map((t) => t.id);
    expect(ids).toContain(notStarted.id);
    expect(ids).toContain(inProgress.id);
    expect(ids).toContain(completed.id);
    expect(ids).not.toContain(archived.id);
  });

  it('filter.status returns only tasks with that status', async () => {
    await tasks.createTask({ title: 'Not started', dueDate: TOMORROW });
    const inProg = await tasks.createTask({
      title: 'In progress',
      dueDate: TOMORROW,
      status: TaskStatus.IN_PROGRESS,
    });
    const result = (await tasks.listTasks({ status: TaskStatus.IN_PROGRESS })).items;
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe(inProg.id);
  });

  it('filter.excludeSubtasks omits subtasks', async () => {
    const parent = await tasks.createTask({
      title: 'Parent',
      dueDate: TOMORROW,
      status: TaskStatus.IN_PROGRESS,
    });
    const sub = await tasks.createSubtask(parent.id, { title: 'Sub' });
    const result = (
      await tasks.listTasks({
        excludeSubtasks: true,
        status: TaskStatus.IN_PROGRESS,
      })
    ).items;
    const ids = result.map((t) => t.id);
    expect(ids).toContain(parent.id);
    expect(ids).not.toContain(sub.id);
  });

  it('filter.projectId=null returns tasks with no project', async () => {
    const withProject = await tasks.createTask({
      title: 'With project',
      dueDate: TOMORROW,
      projectId: FAKE_PROJECT_ID,
      status: TaskStatus.IN_PROGRESS,
    });
    const noProject = await tasks.createTask({
      title: 'No project',
      dueDate: TOMORROW,
      status: TaskStatus.IN_PROGRESS,
    });
    const result = (await tasks.listTasks({ projectId: null, status: TaskStatus.IN_PROGRESS }))
      .items;
    const ids = result.map((t) => t.id);
    expect(ids).toContain(noProject.id);
    expect(ids).not.toContain(withProject.id);
  });

  it('filter.projectId=<id> returns tasks in that project', async () => {
    const inProject = await tasks.createTask({
      title: 'In project',
      dueDate: TOMORROW,
      projectId: FAKE_PROJECT_ID,
      status: TaskStatus.IN_PROGRESS,
    });
    await tasks.createTask({
      title: 'No project',
      dueDate: TOMORROW,
      status: TaskStatus.IN_PROGRESS,
    });
    const result = (await tasks.listTasks({ projectId: FAKE_PROJECT_ID })).items;
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe(inProject.id);
  });

  it('filter.noteId=null returns tasks not linked to any note', async () => {
    const linked = await tasks.createTask({
      title: 'Linked',
      dueDate: TOMORROW,
      linkedNoteId: FAKE_NOTE_ID,
      status: TaskStatus.IN_PROGRESS,
    });
    const unlinked = await tasks.createTask({
      title: 'Unlinked',
      dueDate: TOMORROW,
      status: TaskStatus.IN_PROGRESS,
    });
    const result = (await tasks.listTasks({ noteId: null, status: TaskStatus.IN_PROGRESS })).items;
    const ids = result.map((t) => t.id);
    expect(ids).toContain(unlinked.id);
    expect(ids).not.toContain(linked.id);
  });

  it('filter.noteId=<id> returns tasks linked to that note', async () => {
    const linked = await tasks.createTask({
      title: 'Linked',
      dueDate: TOMORROW,
      linkedNoteId: FAKE_NOTE_ID,
      status: TaskStatus.IN_PROGRESS,
    });
    await tasks.createTask({
      title: 'Other',
      dueDate: TOMORROW,
      linkedNoteId: FAKE_OTHER_NOTE_ID,
      status: TaskStatus.IN_PROGRESS,
    });
    const result = (await tasks.listTasks({ noteId: FAKE_NOTE_ID })).items;
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe(linked.id);
  });

  it('filter.eventId=null returns tasks not linked to any event', async () => {
    await tasks.createTask({
      title: 'Linked',
      dueDate: TOMORROW,
      linkedEventId: FAKE_EVENT_ID,
      status: TaskStatus.IN_PROGRESS,
    });
    const unlinked = await tasks.createTask({
      title: 'Unlinked',
      dueDate: TOMORROW,
      status: TaskStatus.IN_PROGRESS,
    });
    const result = (await tasks.listTasks({ eventId: null, status: TaskStatus.IN_PROGRESS })).items;
    const ids = result.map((t) => t.id);
    expect(ids).toContain(unlinked.id);
  });

  it('filter.eventId=<id> returns tasks linked to that event', async () => {
    const linked = await tasks.createTask({
      title: 'Event task',
      dueDate: TOMORROW,
      linkedEventId: FAKE_EVENT_ID,
      status: TaskStatus.IN_PROGRESS,
    });
    await tasks.createTask({
      title: 'Other event',
      dueDate: TOMORROW,
      linkedEventId: FAKE_OTHER_EVENT_ID,
      status: TaskStatus.IN_PROGRESS,
    });
    const result = (await tasks.listTasks({ eventId: FAKE_EVENT_ID })).items;
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe(linked.id);
  });

  it('filter.priority returns only tasks with that priority', async () => {
    const high = await tasks.createTask({
      title: 'High',
      dueDate: TOMORROW,
      priority: TaskPriority.HIGH,
      status: TaskStatus.IN_PROGRESS,
    });
    await tasks.createTask({
      title: 'Low',
      dueDate: TOMORROW,
      priority: TaskPriority.LOW,
      status: TaskStatus.IN_PROGRESS,
    });
    const result = (await tasks.listTasks({ priority: TaskPriority.HIGH })).items;
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe(high.id);
  });

  it('filter.dueBefore returns tasks due strictly before the date', async () => {
    const early = await tasks.createTask({
      title: 'Early',
      dueDate: YESTERDAY,
      status: TaskStatus.IN_PROGRESS,
    });
    await tasks.createTask({
      title: 'Late',
      dueDate: NEXT_WEEK,
      status: TaskStatus.IN_PROGRESS,
    });
    const result = (await tasks.listTasks({ dueBefore: TOMORROW, status: TaskStatus.IN_PROGRESS }))
      .items;
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe(early.id);
  });

  it('filter.dueAfter returns tasks due strictly after the date', async () => {
    const late = await tasks.createTask({
      title: 'Late',
      dueDate: NEXT_WEEK,
      status: TaskStatus.IN_PROGRESS,
    });
    await tasks.createTask({
      title: 'Early',
      dueDate: YESTERDAY,
      status: TaskStatus.IN_PROGRESS,
    });
    const result = (await tasks.listTasks({ dueAfter: TOMORROW, status: TaskStatus.IN_PROGRESS }))
      .items;
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe(late.id);
  });

  it('filter.dueOn returns tasks due on that calendar day', async () => {
    const today = new Date();
    const midday = new Date(today.getFullYear(), today.getMonth(), today.getDate(), 12, 0, 0);
    const onDay = await tasks.createTask({
      title: 'Today',
      dueDate: midday,
      status: TaskStatus.IN_PROGRESS,
    });
    await tasks.createTask({
      title: 'Yesterday',
      dueDate: YESTERDAY,
      status: TaskStatus.IN_PROGRESS,
    });
    const result = (await tasks.listTasks({ dueOn: today, status: TaskStatus.IN_PROGRESS })).items;
    const ids = result.map((t) => t.id);
    expect(ids).toContain(onDay.id);
  });

  it('sort=dueDate orders by dueDate descending', async () => {
    const early = await tasks.createTask({
      title: 'Early',
      dueDate: YESTERDAY,
      status: TaskStatus.IN_PROGRESS,
    });
    const late = await tasks.createTask({
      title: 'Late',
      dueDate: NEXT_WEEK,
      status: TaskStatus.IN_PROGRESS,
    });
    const result = (
      await tasks.listTasks({ status: TaskStatus.IN_PROGRESS }, { sortBy: 'dueDate' })
    ).items;
    expect(result[0].id).toBe(late.id);
    expect(result[result.length - 1].id).toBe(early.id);
  });

  it('sort=priority orders by priority descending', async () => {
    const high = await tasks.createTask({
      title: 'High',
      dueDate: TOMORROW,
      priority: TaskPriority.HIGH,
    });
    const medium = await tasks.createTask({
      title: 'Medium',
      dueDate: TOMORROW,
      priority: TaskPriority.MEDIUM,
    });
    const low = await tasks.createTask({
      title: 'Low',
      dueDate: TOMORROW,
      priority: TaskPriority.LOW,
    });
    const result = (await tasks.listTasks({}, { sortBy: 'priority' })).items;
    expect(result[0].id).toBe(high.id);
    expect(result[1].id).toBe(medium.id);
    expect(result[2].id).toBe(low.id);
  });

  it('sort=status orders by status descending', async () => {
    const completed = await tasks.createTask({
      title: 'Completed',
      dueDate: TOMORROW,
      status: TaskStatus.COMPLETED,
    });
    const inProgress = await tasks.createTask({
      title: 'In progress',
      dueDate: TOMORROW,
      status: TaskStatus.IN_PROGRESS,
    });
    const notStarted = await tasks.createTask({
      title: 'Not started',
      dueDate: TOMORROW,
      status: TaskStatus.NOT_STARTED,
    });
    const result = (await tasks.listTasks({}, { sortBy: 'status' })).items;
    expect(result[0].id).toBe(completed.id);
    expect(result[1].id).toBe(inProgress.id);
    expect(result[2].id).toBe(notStarted.id);
  });

  it('sort=updatedAt orders by updatedAt descending', async () => {
    const a = await tasks.createTask({ title: 'A', dueDate: TOMORROW });
    const b = await tasks.createTask({ title: 'B', dueDate: TOMORROW });
    // updating A triggers $onUpdate(() => new Date()) which stores ms-precision timestamp,
    // much larger than B's insert default of unixepoch() (seconds), so A sorts first
    await tasks.updateTask(a.id, { title: 'A updated' });
    const result = (await tasks.listTasks({}, { sortBy: 'updatedAt' })).items;
    const ids = result.map((t) => t.id);
    expect(ids.indexOf(a.id)).toBeLessThan(ids.indexOf(b.id));
  });

  it('direction=asc reverses the sort order', async () => {
    const low = await tasks.createTask({
      title: 'Low',
      dueDate: TOMORROW,
      priority: TaskPriority.LOW,
    });
    const medium = await tasks.createTask({
      title: 'Medium',
      dueDate: TOMORROW,
      priority: TaskPriority.MEDIUM,
    });
    const high = await tasks.createTask({
      title: 'High',
      dueDate: TOMORROW,
      priority: TaskPriority.HIGH,
    });
    const result = (await tasks.listTasks({}, { sortBy: 'priority', direction: 'asc' })).items;
    expect(result[0].id).toBe(low.id);
    expect(result[1].id).toBe(medium.id);
    expect(result[2].id).toBe(high.id);
  });

  it('excludes archived tasks regardless of filter', async () => {
    const task = await tasks.createTask({
      title: 'Will archive',
      dueDate: TOMORROW,
      status: TaskStatus.IN_PROGRESS,
    });
    archive.archiveTask(task.id);
    const result = (await tasks.listTasks({ status: TaskStatus.IN_PROGRESS })).items;
    const ids = result.map((t) => t.id);
    expect(ids).not.toContain(task.id);
  });
});

describe('TaskService — listSubtasks', () => {
  it('returns subtasks for the given parent id', async () => {
    const parent = await tasks.createTask({ title: 'Parent', dueDate: TOMORROW });
    const sub1 = await tasks.createSubtask(parent.id, { title: 'Sub 1' });
    const sub2 = await tasks.createSubtask(parent.id, { title: 'Sub 2' });
    const result = (await tasks.listSubtasks(parent.id)).items;
    const ids = result.map((t) => t.id);
    expect(ids).toContain(sub1.id);
    expect(ids).toContain(sub2.id);
    expect(result).toHaveLength(2);
  });

  it('returns an empty array when the parent has no subtasks', async () => {
    const parent = await tasks.createTask({ title: 'Lonely parent', dueDate: TOMORROW });
    const result = (await tasks.listSubtasks(parent.id)).items;
    expect(result).toHaveLength(0);
  });

  it('excludes archived subtasks', async () => {
    const parent = await tasks.createTask({ title: 'Parent', dueDate: TOMORROW });
    const sub = await tasks.createSubtask(parent.id, { title: 'Sub' });
    archive.archiveTask(sub.id);
    const result = (await tasks.listSubtasks(parent.id)).items;
    expect(result).toHaveLength(0);
  });

  it('does not return subtasks belonging to a different parent', async () => {
    const parent1 = await tasks.createTask({ title: 'Parent 1', dueDate: TOMORROW });
    const parent2 = await tasks.createTask({ title: 'Parent 2', dueDate: TOMORROW });
    await tasks.createSubtask(parent2.id, { title: 'Sub of parent 2' });
    const result = (await tasks.listSubtasks(parent1.id)).items;
    expect(result).toHaveLength(0);
  });
});

describe('TaskService — updateTask', () => {
  it('updates the title', async () => {
    const task = await tasks.createTask({ title: 'Old title', dueDate: TOMORROW });
    const updated = await tasks.updateTask(task.id, { title: 'New title' });
    expect(updated!.title).toBe('New title');
  });

  it('updates the description', async () => {
    const task = await tasks.createTask({ title: 'Task', dueDate: TOMORROW });
    const updated = await tasks.updateTask(task.id, { description: 'Added description' });
    expect(updated!.description).toBe('Added description');
  });

  it('updates the priority', async () => {
    const task = await tasks.createTask({ title: 'Task', dueDate: TOMORROW });
    const updated = await tasks.updateTask(task.id, { priority: TaskPriority.HIGH });
    expect(updated!.priority).toBe(TaskPriority.HIGH);
  });

  it('updates the dueDate', async () => {
    const task = await tasks.createTask({ title: 'Task', dueDate: TOMORROW });
    const updated = await tasks.updateTask(task.id, { dueDate: NEXT_WEEK });
    expect(updated!.dueDate!.getTime()).toBe(NEXT_WEEK.getTime());
  });

  it('updates the pullRequestUrl', async () => {
    const task = await tasks.createTask({ title: 'Task', dueDate: TOMORROW });
    const updated = await tasks.updateTask(task.id, {
      pullRequestUrl: 'https://github.com/org/repo/pull/1',
    });
    expect(updated!.pullRequestUrl).toBe('https://github.com/org/repo/pull/1');
  });

  it('returns null for an unknown id', async () => {
    const result = await tasks.updateTask(generateId('task'), { title: 'Ghost' });
    expect(result).toBeNull();
  });
});

describe('TaskService — updateStatus', () => {
  it('updates the task status', async () => {
    const task = await tasks.createTask({ title: 'Task', dueDate: TOMORROW });
    const updated = await tasks.updateStatus(task.id, TaskStatus.IN_PROGRESS);
    expect(updated.status).toBe(TaskStatus.IN_PROGRESS);
  });

  it('sets completedAt when transitioning to COMPLETED', async () => {
    const task = await tasks.createTask({ title: 'Task', dueDate: TOMORROW });
    const before = new Date();
    const updated = await tasks.updateStatus(task.id, TaskStatus.COMPLETED);
    const after = new Date();
    expect(updated.completedAt).not.toBeNull();
    expect(updated.completedAt!.getTime()).toBeGreaterThanOrEqual(before.getTime());
    expect(updated.completedAt!.getTime()).toBeLessThanOrEqual(after.getTime());
  });

  it('clears completedAt when transitioning away from COMPLETED', async () => {
    const task = await tasks.createTask({
      title: 'Task',
      dueDate: TOMORROW,
      status: TaskStatus.COMPLETED,
    });
    expect(task.completedAt).not.toBeNull();
    const updated = await tasks.updateStatus(task.id, TaskStatus.IN_PROGRESS);
    expect(updated.completedAt).toBeNull();
  });

  it('completedAt remains null when transitioning between non-COMPLETED statuses', async () => {
    const task = await tasks.createTask({ title: 'Task', dueDate: TOMORROW });
    const updated = await tasks.updateStatus(task.id, TaskStatus.IN_PROGRESS);
    expect(updated.completedAt).toBeNull();
  });
});

describe('TaskService — updateProject', () => {
  it("updates the task's projectId", async () => {
    const task = await tasks.createTask({ title: 'Task', dueDate: TOMORROW });
    const updated = await tasks.updateProject(task.id, FAKE_PROJECT_ID);
    expect(updated.projectId).toBe(FAKE_PROJECT_ID);
  });

  it('removes the project when null is passed', async () => {
    const task = await tasks.createTask({
      title: 'Task',
      dueDate: TOMORROW,
      projectId: FAKE_PROJECT_ID,
    });
    const updated = await tasks.updateProject(task.id, null);
    expect(updated.projectId).toBeNull();
  });

  it('throws NotFoundError for an unknown task id', async () => {
    await expect(tasks.updateProject(generateId('task'), FAKE_PROJECT_ID)).rejects.toBeInstanceOf(
      NotFoundError,
    );
  });

  it('throws when called on a subtask', async () => {
    const parent = await tasks.createTask({ title: 'Parent', dueDate: TOMORROW });
    const sub = await tasks.createSubtask(parent.id, { title: 'Sub' });
    await expect(tasks.updateProject(sub.id, FAKE_PROJECT_ID)).rejects.toThrow(
      'Subtasks inherit project context from partent task',
    );
  });
});

describe('TaskService — updateLinks', () => {
  it('sets linkedNoteId on a task', async () => {
    const task = await tasks.createTask({ title: 'Task', dueDate: TOMORROW });
    const updated = await tasks.updateLinks(task.id, { linkedNoteId: FAKE_NOTE_ID });
    expect(updated.linkedNoteId).toBe(FAKE_NOTE_ID);
    expect(updated.linkedEventId).toBeNull();
  });

  it('sets linkedEventId on a task', async () => {
    const task = await tasks.createTask({ title: 'Task', dueDate: TOMORROW });
    const updated = await tasks.updateLinks(task.id, { linkedEventId: FAKE_EVENT_ID });
    expect(updated.linkedEventId).toBe(FAKE_EVENT_ID);
    expect(updated.linkedNoteId).toBeNull();
  });

  it('clears both links when nulls are passed', async () => {
    const task = await tasks.createTask({
      title: 'Task',
      dueDate: TOMORROW,
      linkedNoteId: FAKE_NOTE_ID,
    });
    const updated = await tasks.updateLinks(task.id, {
      linkedNoteId: null,
      linkedEventId: null,
    });
    expect(updated.linkedNoteId).toBeNull();
    expect(updated.linkedEventId).toBeNull();
  });

  it('throws NotFoundError for an unknown task id', async () => {
    await expect(
      tasks.updateLinks(generateId('task'), { linkedNoteId: FAKE_NOTE_ID }),
    ).rejects.toBeInstanceOf(NotFoundError);
  });

  it('throws when called on a subtask', async () => {
    const parent = await tasks.createTask({ title: 'Parent', dueDate: TOMORROW });
    const sub = await tasks.createSubtask(parent.id, { title: 'Sub' });
    await expect(tasks.updateLinks(sub.id, { linkedNoteId: FAKE_NOTE_ID })).rejects.toThrow(
      'Subtasks inherit link context from partent task',
    );
  });

  it('throws when both linkedEventId and linkedNoteId are provided', async () => {
    const task = await tasks.createTask({ title: 'Task', dueDate: TOMORROW });
    await expect(
      tasks.updateLinks(task.id, {
        linkedEventId: FAKE_EVENT_ID,
        linkedNoteId: FAKE_NOTE_ID,
      }),
    ).rejects.toThrow('Tasks cannot be linked to both an event and a note');
  });
});

describe('TaskService — promoteSubtask', () => {
  it('sets parentTaskId to null, making the subtask a top-level task', async () => {
    const parent = await tasks.createTask({ title: 'Parent', dueDate: TOMORROW });
    const sub = await tasks.createSubtask(parent.id, { title: 'Sub' });
    const promoted = await tasks.promoteSubtask(sub.id);
    expect(promoted.parentTaskId).toBeNull();
  });

  it('throws NotFoundError for an unknown task id', async () => {
    await expect(tasks.promoteSubtask(generateId('task'))).rejects.toBeInstanceOf(NotFoundError);
  });

  it('throws when the task is not a subtask', async () => {
    const task = await tasks.createTask({ title: 'Top level', dueDate: TOMORROW });
    await expect(tasks.promoteSubtask(task.id)).rejects.toThrow('Task is not a subtask');
  });

  it('promoted task appears as a top-level task in listSubtasks', async () => {
    const parent = await tasks.createTask({ title: 'Parent', dueDate: TOMORROW });
    const sub = await tasks.createSubtask(parent.id, { title: 'Sub' });
    await tasks.promoteSubtask(sub.id);
    const remaining = (await tasks.listSubtasks(parent.id)).items;
    expect(remaining).toHaveLength(0);
  });
});

describe('TaskService — demoteTask', () => {
  it('throws when id and newParentId are the same', async () => {
    const task = await tasks.createTask({ title: 'Self', dueDate: TOMORROW });
    await expect(tasks.demoteTask(task.id, task.id)).rejects.toThrow(
      'Tasks cannot be their own parent',
    );
  });

  it('demotes a task by setting its parentTaskId to newParentId', async () => {
    const parent = await tasks.createTask({ title: 'Parent', dueDate: TOMORROW });
    const child = await tasks.createTask({ title: 'Future child', dueDate: TOMORROW });
    const demoted = await tasks.demoteTask(child.id, parent.id);
    expect(demoted.parentTaskId).toBe(parent.id);
  });

  it('throws NotFoundError when the task to demote does not exist', async () => {
    const parent = await tasks.createTask({ title: 'Parent', dueDate: TOMORROW });
    await expect(tasks.demoteTask(generateId('task'), parent.id)).rejects.toBeInstanceOf(
      NotFoundError,
    );
  });

  it('throws NotFoundError when the new parent does not exist', async () => {
    const child = await tasks.createTask({ title: 'Future child', dueDate: TOMORROW });
    await expect(tasks.demoteTask(child.id, generateId('task'))).rejects.toBeInstanceOf(
      NotFoundError,
    );
  });

  it('throws when the new parent is itself a subtask', async () => {
    const parent = await tasks.createTask({ title: 'Parent', dueDate: TOMORROW });
    const sub = await tasks.createSubtask(parent.id, { title: 'Sub' });
    const child = await tasks.createTask({ title: 'Future child', dueDate: TOMORROW });
    await expect(tasks.demoteTask(child.id, sub.id)).rejects.toThrow(
      'Provided parent task is already a subtask',
    );
  });

  it('throws when the task already has subtasks', async () => {
    const parent = await tasks.createTask({ title: 'Future parent', dueDate: TOMORROW });
    const child = await tasks.createTask({ title: 'Child', dueDate: TOMORROW });
    const newParent = await tasks.createTask({ title: 'New parent', dueDate: TOMORROW });
    // give `parent` a subtask so it can't be demoted
    await tasks.createSubtask(parent.id, { title: 'Sub' });
    await expect(tasks.demoteTask(parent.id, newParent.id)).rejects.toThrow(
      'Provided task has subtasks so cannot be become a subtask',
    );
    // unused but suppresses the lint warning
    void child;
  });
});

describe('ArchiveService — archiveTask', () => {
  it('sets archivedAt to a recent timestamp', async () => {
    const task = await tasks.createTask({ title: 'To archive', dueDate: TOMORROW });
    const before = new Date();
    const archived = archive.archiveTask(task.id);
    const after = new Date();
    expect(archived.archivedAt).not.toBeNull();
    expect(archived.archivedAt!.getTime()).toBeGreaterThanOrEqual(before.getTime());
    expect(archived.archivedAt!.getTime()).toBeLessThanOrEqual(after.getTime());
  });

  it('returns the updated task row', async () => {
    const task = await tasks.createTask({ title: 'Archivable', dueDate: TOMORROW });
    const result = archive.archiveTask(task.id);
    expect(result.id).toBe(task.id);
    expect(result.title).toBe('Archivable');
  });

  it('archived task is no longer returned by TaskService.getById', async () => {
    const task = await tasks.createTask({ title: 'Gone', dueDate: TOMORROW });
    archive.archiveTask(task.id);
    await expect(tasks.getById(task.id)).rejects.toBeInstanceOf(NotFoundError);
  });

  it('archived task is excluded from TaskService.listTasks', async () => {
    const task = await tasks.createTask({
      title: 'Gone',
      dueDate: TOMORROW,
      status: TaskStatus.IN_PROGRESS,
    });
    archive.archiveTask(task.id);
    const result = (await tasks.listTasks({ status: TaskStatus.IN_PROGRESS })).items;
    expect(result.map((t) => t.id)).not.toContain(task.id);
  });

  it('archived subtask is excluded from TaskService.listSubtasks', async () => {
    const parent = await tasks.createTask({ title: 'Parent', dueDate: TOMORROW });
    const sub = await tasks.createSubtask(parent.id, { title: 'Sub' });
    archive.archiveTask(sub.id);
    const result = (await tasks.listSubtasks(parent.id)).items;
    expect(result).toHaveLength(0);
  });

  it('archives all subtasks when the parent task is archived', async () => {
    const parent = await tasks.createTask({ title: 'Parent', dueDate: TOMORROW });
    const sub1 = await tasks.createSubtask(parent.id, { title: 'Sub 1' });
    const sub2 = await tasks.createSubtask(parent.id, { title: 'Sub 2' });
    archive.archiveTask(parent.id);
    await expect(tasks.getById(sub1.id)).rejects.toBeInstanceOf(NotFoundError);
    await expect(tasks.getById(sub2.id)).rejects.toBeInstanceOf(NotFoundError);
    expect((await tasks.listSubtasks(parent.id)).items).toHaveLength(0);
  });

  it('does not overwrite archivedAt of already-archived subtasks', async () => {
    const parent = await tasks.createTask({ title: 'Parent', dueDate: TOMORROW });
    const sub = await tasks.createSubtask(parent.id, { title: 'Pre-archived sub' });
    const archivedSub = archive.archiveTask(sub.id);
    const originalArchivedAt = archivedSub.archivedAt!.getTime();
    archive.archiveTask(parent.id);
    const [row] = await db.select().from(tasksTable).where(eq(tasksTable.id, sub.id));
    expect(row.archivedAt!.getTime()).toBe(originalArchivedAt);
  });

  it("archives the task's linked note", async () => {
    const task = await tasks.createTask({ title: 'Has a note', dueDate: TOMORROW });
    const note = await notesService.createNote({ linkedTaskId: task.id });
    archive.archiveTask(task.id);
    await expect(notesService.getById(note.id)).rejects.toBeInstanceOf(NotFoundError);
  });

  it('does not archive notes linked to a different task', async () => {
    const taskA = await tasks.createTask({ title: 'A', dueDate: TOMORROW });
    const taskB = await tasks.createTask({ title: 'B', dueDate: TOMORROW });
    const noteB = await notesService.createNote({ linkedTaskId: taskB.id });
    archive.archiveTask(taskA.id);
    await expect(notesService.getById(noteB.id)).resolves.toMatchObject({ id: noteB.id });
  });

  it("archives a subtask's own linked note when the parent is archived", async () => {
    const parent = await tasks.createTask({ title: 'Parent', dueDate: TOMORROW });
    const sub = await tasks.createSubtask(parent.id, { title: 'Sub' });
    const subNote = await notesService.createNote({ linkedTaskId: sub.id });
    archive.archiveTask(parent.id);
    await expect(notesService.getById(subNote.id)).rejects.toBeInstanceOf(NotFoundError);
  });

  it('throws NotFoundError for an unknown task id', async () => {
    expect(() => archive.archiveTask(generateId('task'))).toThrow(NotFoundError);
  });

  it('throws AlreadyArchivedError when the task is already archived', async () => {
    const task = await tasks.createTask({ title: 'Archive me once', dueDate: TOMORROW });
    archive.archiveTask(task.id);
    expect(() => archive.archiveTask(task.id)).toThrow(AlreadyArchivedError);
  });
});

describe('ArchiveService — restoreTask', () => {
  it('sets archivedAt back to null', async () => {
    const task = await tasks.createTask({ title: 'Restore me', dueDate: TOMORROW });
    archive.archiveTask(task.id);
    const restored = archive.restoreTask(task.id);
    expect(restored.archivedAt).toBeNull();
  });

  it('returns the updated task row', async () => {
    const task = await tasks.createTask({ title: 'Restore me', dueDate: TOMORROW });
    archive.archiveTask(task.id);
    const result = archive.restoreTask(task.id);
    expect(result.id).toBe(task.id);
  });

  it('restored task is visible via TaskService.getById', async () => {
    const task = await tasks.createTask({ title: 'Restored', dueDate: TOMORROW });
    archive.archiveTask(task.id);
    archive.restoreTask(task.id);
    const found = await tasks.getById(task.id);
    expect(found.id).toBe(task.id);
  });

  it('restored task appears in TaskService.listTasks', async () => {
    const task = await tasks.createTask({
      title: 'Restored',
      dueDate: TOMORROW,
      status: TaskStatus.IN_PROGRESS,
    });
    archive.archiveTask(task.id);
    archive.restoreTask(task.id);
    const result = (await tasks.listTasks({ status: TaskStatus.IN_PROGRESS })).items;
    expect(result.map((t) => t.id)).toContain(task.id);
  });

  it('restored subtask reappears in TaskService.listSubtasks', async () => {
    const parent = await tasks.createTask({ title: 'Parent', dueDate: TOMORROW });
    const sub = await tasks.createSubtask(parent.id, { title: 'Sub' });
    archive.archiveTask(sub.id);
    archive.restoreTask(sub.id);
    const result = (await tasks.listSubtasks(parent.id)).items;
    expect(result.map((t) => t.id)).toContain(sub.id);
  });

  it('restores all subtasks when the parent task is restored', async () => {
    const parent = await tasks.createTask({ title: 'Parent', dueDate: TOMORROW });
    const sub1 = await tasks.createSubtask(parent.id, { title: 'Sub 1' });
    const sub2 = await tasks.createSubtask(parent.id, { title: 'Sub 2' });
    archive.archiveTask(parent.id);
    archive.restoreTask(parent.id);
    const subtasks = (await tasks.listSubtasks(parent.id)).items;
    const ids = subtasks.map((t) => t.id);
    expect(ids).toContain(sub1.id);
    expect(ids).toContain(sub2.id);
  });

  it("restores the task's linked note", async () => {
    const task = await tasks.createTask({ title: 'Has a note', dueDate: TOMORROW });
    const note = await notesService.createNote({ linkedTaskId: task.id });
    archive.archiveTask(task.id);
    archive.restoreTask(task.id);
    await expect(notesService.getById(note.id)).resolves.toMatchObject({ id: note.id });
  });

  it("restores a subtask's own linked note when the parent is restored", async () => {
    const parent = await tasks.createTask({ title: 'Parent', dueDate: TOMORROW });
    const sub = await tasks.createSubtask(parent.id, { title: 'Sub' });
    const subNote = await notesService.createNote({ linkedTaskId: sub.id });
    archive.archiveTask(parent.id);
    archive.restoreTask(parent.id);
    await expect(notesService.getById(subNote.id)).resolves.toMatchObject({ id: subNote.id });
  });

  it('does not restore notes linked to a different task', async () => {
    const taskA = await tasks.createTask({ title: 'A', dueDate: TOMORROW });
    const taskB = await tasks.createTask({ title: 'B', dueDate: TOMORROW });
    const noteB = await notesService.createNote({ linkedTaskId: taskB.id });
    archive.archiveNote(noteB.id);
    archive.archiveTask(taskA.id);
    archive.restoreTask(taskA.id);
    await expect(notesService.getById(noteB.id)).rejects.toBeInstanceOf(NotFoundError);
  });

  it('throws NotFoundError for an unknown task id', async () => {
    expect(() => archive.restoreTask(generateId('task'))).toThrow(NotFoundError);
  });

  it('throws NotArchivedError when the task is not archived', async () => {
    const task = await tasks.createTask({ title: 'Never archived', dueDate: TOMORROW });
    expect(() => archive.restoreTask(task.id)).toThrow(NotArchivedError);
  });
});

describe('TaskService — cursor pagination', () => {
  async function seed(n: number) {
    const created = [];
    for (let i = 0; i < n; i++) {
      created.push(
        await tasks.createTask({
          title: `T${i}`,
          dueDate: TOMORROW,
          priority: ((i % 3) + 1) as TaskPriority,
        }),
      );
    }
    return created;
  }

  async function collect(
    sort: Parameters<TaskService['listTasks']>[1],
    limit: number,
    filter: Parameters<TaskService['listTasks']>[0] = {},
  ) {
    const ids: string[] = [];
    let cursor: string | undefined;
    let pages = 0;
    do {
      const page = await tasks.listTasks(filter, sort, { limit, cursor });
      expect(page.items.length).toBeLessThanOrEqual(limit);
      ids.push(...page.items.map((t) => t.id));
      cursor = page.nextCursor ?? undefined;
      pages++;
    } while (cursor);
    return { ids, pages };
  }

  it('returns a null nextCursor when everything fits in one page', async () => {
    await seed(3);
    const page = await tasks.listTasks();
    expect(page.items).toHaveLength(3);
    expect(page.nextCursor).toBeNull();
  });

  it('pages through all tasks exactly once with no duplicates (default sort, ties on createdAt)', async () => {
    const created = await seed(7);
    const { ids, pages } = await collect({ sortBy: 'createdAt' }, 3);
    expect(pages).toBe(3);
    expect(ids).toEqual(created.map((t) => t.id).reverse());
  });

  it('paginated order matches the unpaginated order for every sort and direction', async () => {
    await seed(8);
    for (const sortBy of ['priority', 'dueDate', 'status', 'createdAt', 'updatedAt'] as const) {
      for (const direction of ['asc', 'desc'] as const) {
        const full = (await tasks.listTasks({}, { sortBy, direction }, { limit: 200 })).items;
        const { ids } = await collect({ sortBy, direction }, 3);
        expect(ids).toEqual(full.map((t) => t.id));
      }
    }
  });

  it('paginates ties on a low-cardinality column (priority) without skipping or repeating', async () => {
    await seed(9);
    const { ids } = await collect({ sortBy: 'priority', direction: 'asc' }, 2);
    expect(new Set(ids).size).toBe(9);
  });

  it('respects filters across pages', async () => {
    await seed(5);
    await tasks.createTask({ title: 'done', dueDate: TOMORROW, status: TaskStatus.COMPLETED });
    const { ids } = await collect({ sortBy: 'createdAt' }, 2, { status: TaskStatus.NOT_STARTED });
    expect(ids).toHaveLength(5);
  });

  it('a task created between page requests does not cause duplicates or skips', async () => {
    const created = await seed(4);
    const first = await tasks.listTasks({}, { sortBy: 'createdAt' }, { limit: 2 });
    await tasks.createTask({ title: 'late', dueDate: TOMORROW });
    const second = await tasks.listTasks(
      {},
      { sortBy: 'createdAt' },
      { limit: 2, cursor: first.nextCursor! },
    );
    const ids = [...first.items, ...second.items].map((t) => t.id);
    expect(ids).toEqual(created.map((t) => t.id).reverse());
  });

  it('a task archived between page requests is not returned, others are unaffected', async () => {
    const created = await seed(4);
    const first = await tasks.listTasks({}, { sortBy: 'createdAt' }, { limit: 2 });
    archive.archiveTask(created[0].id);
    const second = await tasks.listTasks(
      {},
      { sortBy: 'createdAt' },
      { limit: 2, cursor: first.nextCursor! },
    );
    expect(second.items.map((t) => t.id)).toEqual([created[1].id]);
    expect(second.nextCursor).toBeNull();
  });

  it('clamps limit to the maximum and rejects invalid limits', async () => {
    await seed(1);
    await expect(tasks.listTasks({}, undefined, { limit: 0 })).rejects.toThrow(RangeError);
    const page = await tasks.listTasks({}, undefined, { limit: 100_000 });
    expect(page.items).toHaveLength(1);
  });

  it('rejects garbage cursors and cursors from a different sort', async () => {
    await seed(3);
    await expect(tasks.listTasks({}, undefined, { cursor: 'garbage' })).rejects.toThrow(
      InvalidCursorError,
    );
    const page = await tasks.listTasks({}, { sortBy: 'createdAt' }, { limit: 1 });
    await expect(
      tasks.listTasks({}, { sortBy: 'priority' }, { cursor: page.nextCursor! }),
    ).rejects.toThrow(InvalidCursorError);
  });

  it('listSubtasks paginates', async () => {
    const parent = await tasks.createTask({ title: 'P', dueDate: TOMORROW });
    const subs = [];
    for (let i = 0; i < 5; i++) subs.push(await tasks.createSubtask(parent.id, { title: `S${i}` }));
    const ids: string[] = [];
    let cursor: string | undefined;
    do {
      const page = await tasks.listSubtasks(parent.id, { limit: 2, cursor });
      ids.push(...page.items.map((t) => t.id));
      cursor = page.nextCursor ?? undefined;
    } while (cursor);
    expect(ids).toEqual(subs.map((t) => t.id).reverse());
  });
});

describe('TaskService — undated tasks', () => {
  // local tasks always get a due date; synced ones may not, so tests clear it on the row directly
  async function undated(title: string) {
    const task = await tasks.createTask({ title, dueDate: TOMORROW });
    await db.update(tasksTable).set({ dueDate: null }).where(eq(tasksTable.id, task.id));
    return { ...task, dueDate: null };
  }

  async function dated(title: string, dueDate: Date) {
    return tasks.createTask({ title, dueDate });
  }

  async function collect(direction: 'asc' | 'desc', limit: number) {
    const ids: string[] = [];
    let cursor: string | undefined;
    do {
      const page = await tasks.listTasks({}, { sortBy: 'dueDate', direction }, { limit, cursor });
      ids.push(...page.items.map((t) => t.id));
      cursor = page.nextCursor ?? undefined;
    } while (cursor);
    return ids;
  }

  /** dated tasks by (dueDate, id) in `direction`, then undated tasks by id in `direction` */
  function expectedOrder(
    all: { id: string; dueDate: Date | null }[],
    direction: 'asc' | 'desc',
  ): string[] {
    const sign = direction === 'asc' ? 1 : -1;
    const byId = (a: { id: string }, b: { id: string }) => sign * (a.id < b.id ? -1 : 1);
    const withDate = all
      .filter((t) => t.dueDate !== null)
      .sort((a, b) => sign * (a.dueDate!.getTime() - b.dueDate!.getTime()) || byId(a, b));
    const withoutDate = all.filter((t) => t.dueDate === null).sort(byId);
    return [...withDate, ...withoutDate].map((t) => t.id);
  }

  async function seedMixed() {
    // interleave creation so ids of dated and undated tasks are mixed, with ties on dueDate
    const all = [];
    for (let i = 0; i < 4; i++) {
      all.push(await dated(`D${i}`, i % 2 ? TOMORROW : NEXT_WEEK));
      all.push(await undated(`U${i}`));
    }
    all.push(await dated('D4', YESTERDAY));
    return all;
  }

  it('reads back a null dueDate', async () => {
    const task = await undated('No date');
    expect((await tasks.getById(task.id)).dueDate).toBeNull();
  });

  it.each(['asc', 'desc'] as const)(
    'sorts undated tasks last when sorting by dueDate %s',
    async (direction) => {
      const all = await seedMixed();
      const page = await tasks.listTasks({}, { sortBy: 'dueDate', direction }, { limit: 200 });
      expect(page.items.map((t) => t.id)).toEqual(expectedOrder(all, direction));
    },
  );

  it.each(['asc', 'desc'] as const)(
    'pages %s across the dated/undated boundary without skipping or repeating',
    async (direction) => {
      const all = await seedMixed();
      // every limit puts the boundary, and a null cursor, at a different place in a page
      for (const limit of [1, 2, 3, 4]) {
        expect(await collect(direction, limit)).toEqual(expectedOrder(all, direction));
      }
    },
  );

  it.each(['asc', 'desc'] as const)(
    'resumes %s from a cursor whose last value is null',
    async (direction) => {
      await dated('D', TOMORROW);
      const nulls = [await undated('U0'), await undated('U1'), await undated('U2')];
      const nullIds = nulls.map((t) => t.id).sort();
      if (direction === 'desc') nullIds.reverse();

      // page 1 ends on the dated task, page 2 on the first undated one
      const first = await tasks.listTasks({}, { sortBy: 'dueDate', direction }, { limit: 1 });
      const second = await tasks.listTasks(
        {},
        { sortBy: 'dueDate', direction },
        { limit: 1, cursor: first.nextCursor! },
      );
      expect(second.items.map((t) => t.id)).toEqual([nullIds[0]]);

      const rest = await tasks.listTasks(
        {},
        { sortBy: 'dueDate', direction },
        { limit: 10, cursor: second.nextCursor! },
      );
      expect(rest.items.map((t) => t.id)).toEqual(nullIds.slice(1));
      expect(rest.nextCursor).toBeNull();
    },
  );

  it('pages undated tasks under other sorts as before', async () => {
    const all = await seedMixed();
    const page = await tasks.listTasks(
      {},
      { sortBy: 'createdAt', direction: 'asc' },
      { limit: 200 },
    );
    expect(page.items.map((t) => t.id)).toEqual(all.map((t) => t.id));
  });

  it('excludes undated tasks from dueBefore, dueAfter and dueOn', async () => {
    const before = await dated('Yesterday', YESTERDAY);
    const after = await dated('Next week', NEXT_WEEK);
    const on = await dated('Tomorrow', TOMORROW);
    await undated('No date');

    const ids = async (filter: Parameters<TaskService['listTasks']>[0]) =>
      (await tasks.listTasks(filter, undefined, { limit: 200 })).items.map((t) => t.id);

    expect(await ids({ dueBefore: new Date() })).toEqual([before.id]);
    expect(await ids({ dueAfter: TOMORROW })).toEqual([after.id]);
    expect(await ids({ dueOn: TOMORROW })).toEqual([on.id]);
  });

  it('createSubtask throws when neither the subtask nor its parent has a due date', async () => {
    const parent = await undated('Undated parent');
    await expect(tasks.createSubtask(parent.id, { title: 'Sub' })).rejects.toThrow(
      'Subtasks need a due date when their parent task has none',
    );
  });

  it('createSubtask under an undated parent uses its own due date', async () => {
    const parent = await undated('Undated parent');
    const sub = await tasks.createSubtask(parent.id, { title: 'Sub', dueDate: NEXT_WEEK });
    expect(sub.dueDate!.getTime()).toBe(NEXT_WEEK.getTime());
  });
});
