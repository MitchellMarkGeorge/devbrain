import { describe, it, expect, beforeEach } from 'vitest';
import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { generateId } from '@common/ids';
import { TaskService } from '../../tasks/service';
import { ArchiveService } from '../../archive/service';
import { TaskPriority, TaskStatus } from '../../tasks/types';
import { NotFoundError } from '../../shared/errors';

const MIGRATIONS_PATH = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../../../db/migrations',
);

const FAKE_PROJECT_ID = generateId('project');
const FAKE_NOTE_ID = generateId('note');
const FAKE_OTHER_NOTE_ID = generateId('note');
const FAKE_EVENT_ID = generateId('event');
const FAKE_OTHER_EVENT_ID = generateId('event');

const TOMORROW = new Date(Date.now() + 86_400_000);
const YESTERDAY = new Date(Date.now() - 86_400_000);
const NEXT_WEEK = new Date(Date.now() + 7 * 86_400_000);

function createDb(): BetterSQLite3Database {
  const sqlite = new Database(':memory:');
  const db = drizzle({ client: sqlite, casing: 'snake_case' });
  migrate(db, { migrationsFolder: MIGRATIONS_PATH });
  // migration 0004 leaves foreign_keys=ON; disable for tests so we can use
  // fake foreign-key ids without seeding parent tables (for now)
  sqlite.pragma('foreign_keys = OFF');
  return db;
}

let db: BetterSQLite3Database;
let tasks: TaskService;
let archive: ArchiveService;

beforeEach(() => {
  db = createDb();
  tasks = new TaskService(db);
  archive = new ArchiveService(db);
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

// ---------------------------------------------------------------------------
// createSubtask
// ---------------------------------------------------------------------------

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
    expect(sub.dueDate.getTime()).toBe(parent.dueDate.getTime());
  });

  it('uses its own dueDate when one is provided', async () => {
    const parent = await tasks.createTask({ title: 'Parent', dueDate: TOMORROW });
    const sub = await tasks.createSubtask(parent.id, { title: 'Sub', dueDate: NEXT_WEEK });
    expect(sub.dueDate.getTime()).toBe(NEXT_WEEK.getTime());
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
    expect(found).not.toBeNull();
    expect(found!.id).toBe(created.id);
    expect(found!.title).toBe('Find me');
  });

  it('returns null for an unknown id', async () => {
    const result = await tasks.getById(generateId('task'));
    expect(result).toBeNull();
  });

  it('returns null for an archived task', async () => {
    const task = await tasks.createTask({ title: 'Soon archived', dueDate: TOMORROW });
    await archive.archiveTask(task.id);
    const result = await tasks.getById(task.id);
    expect(result).toBeNull();
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
    await archive.archiveTask(task.id);
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
    await archive.archiveTask(archived.id);

    const result = await tasks.listTasks();
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
    const result = await tasks.listTasks({ status: TaskStatus.IN_PROGRESS });
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
    const result = await tasks.listTasks({
      excludeSubtasks: true,
      status: TaskStatus.IN_PROGRESS,
    });
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
    const result = await tasks.listTasks({ projectId: null, status: TaskStatus.IN_PROGRESS });
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
    const result = await tasks.listTasks({ projectId: FAKE_PROJECT_ID });
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
    const result = await tasks.listTasks({ noteId: null, status: TaskStatus.IN_PROGRESS });
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
    const result = await tasks.listTasks({ noteId: FAKE_NOTE_ID });
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
    const result = await tasks.listTasks({ eventId: null, status: TaskStatus.IN_PROGRESS });
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
    const result = await tasks.listTasks({ eventId: FAKE_EVENT_ID });
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
    const result = await tasks.listTasks({ priority: TaskPriority.HIGH });
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
    const result = await tasks.listTasks({ dueBefore: TOMORROW, status: TaskStatus.IN_PROGRESS });
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
    const result = await tasks.listTasks({ dueAfter: TOMORROW, status: TaskStatus.IN_PROGRESS });
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
    const result = await tasks.listTasks({ dueOn: today, status: TaskStatus.IN_PROGRESS });
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
    const result = await tasks.listTasks({ status: TaskStatus.IN_PROGRESS }, 'dueDate');
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
    const result = await tasks.listTasks({}, 'priority');
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
    const result = await tasks.listTasks({}, 'status');
    expect(result[0].id).toBe(completed.id);
    expect(result[1].id).toBe(inProgress.id);
    expect(result[2].id).toBe(notStarted.id);
  });

  it('sort=lastUpdated orders by updatedAt descending', async () => {
    const a = await tasks.createTask({ title: 'A', dueDate: TOMORROW });
    const b = await tasks.createTask({ title: 'B', dueDate: TOMORROW });
    // updating A triggers $onUpdate(() => new Date()) which stores ms-precision timestamp,
    // much larger than B's insert default of unixepoch() (seconds), so A sorts first
    await tasks.updateTask(a.id, { title: 'A updated' });
    const result = await tasks.listTasks({}, 'lastUpdated');
    const ids = result.map((t) => t.id);
    expect(ids.indexOf(a.id)).toBeLessThan(ids.indexOf(b.id));
  });

  it('excludes archived tasks regardless of filter', async () => {
    const task = await tasks.createTask({
      title: 'Will archive',
      dueDate: TOMORROW,
      status: TaskStatus.IN_PROGRESS,
    });
    await archive.archiveTask(task.id);
    const result = await tasks.listTasks({ status: TaskStatus.IN_PROGRESS });
    const ids = result.map((t) => t.id);
    expect(ids).not.toContain(task.id);
  });
});

// ---------------------------------------------------------------------------
// listSubtasks
// ---------------------------------------------------------------------------

describe('TaskService — listSubtasks', () => {
  it('returns subtasks for the given parent id', async () => {
    const parent = await tasks.createTask({ title: 'Parent', dueDate: TOMORROW });
    const sub1 = await tasks.createSubtask(parent.id, { title: 'Sub 1' });
    const sub2 = await tasks.createSubtask(parent.id, { title: 'Sub 2' });
    const result = await tasks.listSubtasks(parent.id);
    const ids = result.map((t) => t.id);
    expect(ids).toContain(sub1.id);
    expect(ids).toContain(sub2.id);
    expect(result).toHaveLength(2);
  });

  it('returns an empty array when the parent has no subtasks', async () => {
    const parent = await tasks.createTask({ title: 'Lonely parent', dueDate: TOMORROW });
    const result = await tasks.listSubtasks(parent.id);
    expect(result).toHaveLength(0);
  });

  it('excludes archived subtasks', async () => {
    const parent = await tasks.createTask({ title: 'Parent', dueDate: TOMORROW });
    const sub = await tasks.createSubtask(parent.id, { title: 'Sub' });
    await archive.archiveTask(sub.id);
    const result = await tasks.listSubtasks(parent.id);
    expect(result).toHaveLength(0);
  });

  it('does not return subtasks belonging to a different parent', async () => {
    const parent1 = await tasks.createTask({ title: 'Parent 1', dueDate: TOMORROW });
    const parent2 = await tasks.createTask({ title: 'Parent 2', dueDate: TOMORROW });
    await tasks.createSubtask(parent2.id, { title: 'Sub of parent 2' });
    const result = await tasks.listSubtasks(parent1.id);
    expect(result).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// updateTask
// ---------------------------------------------------------------------------

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
    expect(updated!.dueDate.getTime()).toBe(NEXT_WEEK.getTime());
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

// ---------------------------------------------------------------------------
// updateStatus
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// updateProject
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// updateLinks
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// promoteSubtask
// ---------------------------------------------------------------------------

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
    const remaining = await tasks.listSubtasks(parent.id);
    expect(remaining).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// demoteTask
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// ArchiveService — archiveTask
// ---------------------------------------------------------------------------

describe('ArchiveService — archiveTask', () => {
  it('sets archivedAt to a recent timestamp', async () => {
    const task = await tasks.createTask({ title: 'To archive', dueDate: TOMORROW });
    const before = new Date();
    const archived = await archive.archiveTask(task.id);
    const after = new Date();
    expect(archived.archivedAt).not.toBeNull();
    expect(archived.archivedAt!.getTime()).toBeGreaterThanOrEqual(before.getTime());
    expect(archived.archivedAt!.getTime()).toBeLessThanOrEqual(after.getTime());
  });

  it('returns the updated task row', async () => {
    const task = await tasks.createTask({ title: 'Archivable', dueDate: TOMORROW });
    const result = await archive.archiveTask(task.id);
    expect(result.id).toBe(task.id);
    expect(result.title).toBe('Archivable');
  });

  it('archived task is no longer returned by TaskService.getById', async () => {
    const task = await tasks.createTask({ title: 'Gone', dueDate: TOMORROW });
    await archive.archiveTask(task.id);
    expect(await tasks.getById(task.id)).toBeNull();
  });

  it('archived task is excluded from TaskService.listTasks', async () => {
    const task = await tasks.createTask({
      title: 'Gone',
      dueDate: TOMORROW,
      status: TaskStatus.IN_PROGRESS,
    });
    await archive.archiveTask(task.id);
    const result = await tasks.listTasks({ status: TaskStatus.IN_PROGRESS });
    expect(result.map((t) => t.id)).not.toContain(task.id);
  });

  it('archived subtask is excluded from TaskService.listSubtasks', async () => {
    const parent = await tasks.createTask({ title: 'Parent', dueDate: TOMORROW });
    const sub = await tasks.createSubtask(parent.id, { title: 'Sub' });
    await archive.archiveTask(sub.id);
    const result = await tasks.listSubtasks(parent.id);
    expect(result).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// ArchiveService — restoreTask
// ---------------------------------------------------------------------------

describe('ArchiveService — restoreTask', () => {
  it('sets archivedAt back to null', async () => {
    const task = await tasks.createTask({ title: 'Restore me', dueDate: TOMORROW });
    await archive.archiveTask(task.id);
    const restored = await archive.restoreTask(task.id);
    expect(restored.archivedAt).toBeNull();
  });

  it('returns the updated task row', async () => {
    const task = await tasks.createTask({ title: 'Restore me', dueDate: TOMORROW });
    await archive.archiveTask(task.id);
    const result = await archive.restoreTask(task.id);
    expect(result.id).toBe(task.id);
  });

  it('restored task is visible via TaskService.getById', async () => {
    const task = await tasks.createTask({ title: 'Restored', dueDate: TOMORROW });
    await archive.archiveTask(task.id);
    await archive.restoreTask(task.id);
    const found = await tasks.getById(task.id);
    expect(found).not.toBeNull();
    expect(found!.id).toBe(task.id);
  });

  it('restored task appears in TaskService.listTasks', async () => {
    const task = await tasks.createTask({
      title: 'Restored',
      dueDate: TOMORROW,
      status: TaskStatus.IN_PROGRESS,
    });
    await archive.archiveTask(task.id);
    await archive.restoreTask(task.id);
    const result = await tasks.listTasks({ status: TaskStatus.IN_PROGRESS });
    expect(result.map((t) => t.id)).toContain(task.id);
  });

  it('restored subtask reappears in TaskService.listSubtasks', async () => {
    const parent = await tasks.createTask({ title: 'Parent', dueDate: TOMORROW });
    const sub = await tasks.createSubtask(parent.id, { title: 'Sub' });
    await archive.archiveTask(sub.id);
    await archive.restoreTask(sub.id);
    const result = await tasks.listSubtasks(parent.id);
    expect(result.map((t) => t.id)).toContain(sub.id);
  });
});
