import { ProjectId, TaskId } from '@common/ids';
import { tasks } from '@main/db/schema/tasks';
import { eq, inArray, and, isNull, SQL, lt, gt, gte, desc, asc } from 'drizzle-orm';
import { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import {
  CreateSubTaskOptions,
  CreateTaskOptions,
  Task,
  TaskFilterOptions,
  TaskPriority,
  TaskSortOptions,
  TaskStatus,
  UpdateTaskLinkOptions,
  UpdateTaskOptions,
} from './types';
import { NotFoundError } from '../shared/errors';
import { isSubtask } from './utils';
import { SQLiteColumn } from 'drizzle-orm/sqlite-core';
import { localDayWindow } from '../shared/utils';

export class TaskService {
  constructor(private readonly db: BetterSQLite3Database) {}

  async getById(id: TaskId): Promise<Task | null> {
    const [row] = await this.activeTasks(eq(tasks.id, id)).limit(1);
    return row ?? null;
  }

  async getByIds(ids: TaskId[]): Promise<Task[]> {
    return this.activeTasks(inArray(tasks.id, ids));
  }

  async createTask(options: CreateTaskOptions): Promise<Task> {
    if (options.linkedEventId && options.linkedNoteId) {
      throw Error('Tasks cannot be linked to both an event and a note');
    }

    const newTask = {
      title: options.title,
      description: options.description ?? null,
      status: options.status ?? TaskStatus.NOT_STARTED,
      priority: options.priority ?? TaskPriority.LOW,
      dueDate: options.dueDate,
      startDate: options.startDate ?? null,
      // subtasts are created seperately
      parentTaskId: null,
      projectId: options.projectId ?? null,
      // only one of theses should be defined if at all
      linkedNoteId: options.linkedNoteId ?? null,
      linkedEventId: options.linkedEventId ?? null,

      completedAt: options.status === TaskStatus.COMPLETED ? new Date() : null,
    };

    const [insertedTask] = await this.db.insert(tasks).values(newTask).returning();
    return insertedTask;
  }

  async createSubtask(parentTaskId: TaskId, options: CreateSubTaskOptions): Promise<Task> {
    const parentTask = await this.getById(parentTaskId);
    // no task matching provided id
    if (!parentTask) throw new NotFoundError(parentTaskId);

    if (isSubtask(parentTask)) {
      throw new Error('Subtasks cannot create their own subtasks');
    }

    const newSubtask = {
      title: options.title,
      description: options.description ?? null,
      status: options.status ?? TaskStatus.NOT_STARTED,
      priority: options.priority ?? TaskPriority.LOW,
      // inherit the parents due date if none is provided?
      dueDate: options.dueDate ?? parentTask.dueDate,
      startDate: options.startDate ?? null,
      // inherit the parents context by default
      parentTaskId: parentTaskId,
      projectId: parentTask.projectId,
      linkedNoteId: parentTask.linkedNoteId,
      linkedEventId: parentTask.linkedEventId,
      completedAt: options.status === TaskStatus.COMPLETED ? new Date() : null,
    };
    const [insertedTask] = await this.db.insert(tasks).values(newSubtask).returning();
    return insertedTask;
  }

  async listTasks(filter: TaskFilterOptions = {}, sort: TaskSortOptions = { sortBy: 'created' }) {
    const clauses = [isNull(tasks.archivedAt)];
    if (filter.excludeSubtasks) clauses.push(isNull(tasks.parentTaskId));

    if (filter.status) clauses.push(eq(tasks.status, filter.status));

    if (filter.projectId !== undefined) {
      clauses.push(
        filter.projectId === null ? isNull(tasks.projectId) : eq(tasks.projectId, filter.projectId),
      );
    }

    if (filter.noteId !== undefined) {
      clauses.push(
        filter.noteId === null ? isNull(tasks.linkedNoteId) : eq(tasks.linkedNoteId, filter.noteId),
      );
    }

    if (filter.eventId !== undefined) {
      clauses.push(
        filter.eventId === null
          ? isNull(tasks.linkedEventId)
          : eq(tasks.linkedEventId, filter.eventId),
      );
    }

    if (filter.priority) clauses.push(eq(tasks.priority, filter.priority));
    // figure this out
    if (filter.dueBefore != null) clauses.push(lt(tasks.dueDate, filter.dueBefore));
    if (filter.dueAfter != null) clauses.push(gt(tasks.dueDate, filter.dueAfter));
    if (filter.dueOn != null) {
      // get the start and end time the date and compare (inclusive start and exlusive end/midnight)
      const { startOfDay, endOfDay } = localDayWindow(filter.dueOn);
      clauses.push(gte(tasks.dueDate, startOfDay));
      clauses.push(lt(tasks.dueDate, endOfDay));
    }

    let orderColunm: SQLiteColumn;
    switch (sort.sortBy) {
      case 'dueDate':
        orderColunm = tasks.dueDate;
        break;
      case 'priority':
        orderColunm = tasks.priority;
        break;
      case 'status':
        orderColunm = tasks.status;
        break;
      case 'created':
        orderColunm = tasks.createdAt;
        break;
      case 'lastUpdated':
        orderColunm = tasks.updatedAt;
        break;
    }

    const order = sort.direction === 'asc' ? asc(orderColunm) : desc(orderColunm);

    return this.db
      .select()
      .from(tasks)
      .where(and(...clauses))
      .orderBy(order)
      .all();
  }

  async listSubtasks(parentTaskId: TaskId): Promise<Task[]> {
    return this.activeTasks(eq(tasks.parentTaskId, parentTaskId));
  }

  async updateTask(id: TaskId, updates: UpdateTaskOptions): Promise<Task | null> {
    const [updatedTask] = await this.db
      .update(tasks)
      .set(updates)
      .where(eq(tasks.id, id))
      .returning();
    return updatedTask ?? null;
  }

  async updateStatus(id: TaskId, newStatus: TaskStatus): Promise<Task> {
    const [row] = await this.db
      .update(tasks)
      .set({
        // if a task is now complete, set a new completedAt timestamp
        // if not, set it to null (this also applies to tasks that were once completed and have their status changed)
        completedAt: newStatus === TaskStatus.COMPLETED ? new Date() : null,
        status: newStatus,
      })
      .where(eq(tasks.id, id))
      .returning();

    // if all the tasks in a project are marked as completed, then the project shoudl be marked as completed
    // this shoudl also happen vice versa
    return row;
  }

  async updateProject(id: TaskId, projectId: ProjectId | null): Promise<Task> {
    const task = await this.getById(id);
    if (!task) throw new NotFoundError(id);

    if (isSubtask(task)) {
      throw new Error('Subtasks inherit project context from partent task');
    }

    const [row] = await this.db
      .update(tasks)
      .set({
        projectId,
      })
      .where(eq(tasks.id, id))
      .returning();

    return row;
  }

  async updateLinks(id: TaskId, options: UpdateTaskLinkOptions): Promise<Task> {
    const task = await this.getById(id);
    if (!task) throw new NotFoundError(id);

    if (isSubtask(task)) {
      throw new Error('Subtasks inherit link context from partent task');
    }

    if (options.linkedEventId && options.linkedNoteId) {
      throw Error('Tasks cannot be linked to both an event and a note');
    }

    const [row] = await this.db
      .update(tasks)
      .set({
        linkedEventId: options.linkedEventId ?? null,
        linkedNoteId: options.linkedNoteId ?? null,
      })
      .where(eq(tasks.id, id))
      .returning();

    return row;
  }

  async promoteSubtask(id: TaskId): Promise<Task> {
    // makes an existing subtask a top level task
    const task = await this.getById(id);
    if (!task) throw new NotFoundError(id);

    if (!isSubtask(task)) {
      throw new Error('Task is not a subtask');
    }

    const [row] = await this.db
      .update(tasks)
      .set({
        parentTaskId: null,
      })
      .where(eq(tasks.id, id))
      .returning();

    return row;
  }

  async demoteTask(id: TaskId, newParentId: TaskId): Promise<Task> {
    // makes an existing top level task a subtask of another task
    // the existing task will inherit the context if its new parent, even if already has its own
    if (id === newParentId) throw new Error('Tasks cannot be their own parent');

    const task = await this.getById(id);
    const parentTask = await this.getById(id);

    if (!task) throw new NotFoundError(id);
    if (!parentTask) throw new NotFoundError(newParentId);

    if (isSubtask(parentTask)) {
      throw new Error('Provided parent task is already a subtask');
    }

    const numOfSubtasks = await this.db.$count(
      tasks,
      and(eq(tasks.parentTaskId, id), isNull(tasks.archivedAt)),
    );

    if (numOfSubtasks > 0)
      throw new Error('Provided task has subtasks so cannot be become a subtask');

    const [row] = await this.db
      .update(tasks)
      .set({
        parentTaskId: newParentId,
        // override all previous context (WARN THE USER)
        projectId: parentTask.projectId,
        linkedNoteId: parentTask.linkedNoteId,
        linkedEventId: parentTask.linkedEventId,
      })
      .where(eq(tasks.id, id))
      .returning();

    return row;
  }

  private activeTasks(condition: SQL<unknown>) {
    // automatically filters out archived tasks
    return (
      this.db
        .select()
        .from(tasks)
        .where(and(condition, isNull(tasks.archivedAt)))
        // by default sort by created at (come back to this)
        .orderBy(desc(tasks.createdAt))
    );
  }
}
