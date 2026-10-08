import { ProjectId, TaskId } from '@common/ids';
import { tasks } from '@main/db/schema/tasks';
import { eq, inArray, notInArray, and, isNull, not, SQL, lt, gt, gte, desc } from 'drizzle-orm';
import { NodeSQLiteDatabase } from '@main/db/node-sqlite';
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
import { keyset, Page, PageOptions } from '../shared/pagination';
import {
  assertEditable,
  assertRowEditable,
  hasLinkInState,
  isSynced,
  withRef,
  withRefs,
} from '../integrations/refs';
import { LinkState } from '../integrations/types';

export class TaskService {
  constructor(private readonly db: NodeSQLiteDatabase) {}

  async getById(id: TaskId): Promise<Task> {
    const [row] = await this.activeTasks(eq(tasks.id, id)).limit(1);
    if (!row) throw new NotFoundError(id);
    return withRef(this.db, row);
  }

  async getByIds(ids: TaskId[]): Promise<Task[]> {
    return withRefs(this.db, await this.activeTasks(inArray(tasks.id, ids)));
  }

  // a local task can be created in a mirrored project: it stays local and sync never touches it
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
    // throws NotFoundError when no task matches the provided id
    const parentTask = await this.getById(parentTaskId);
    // a synced parent's subtree is provider-owned, so it is rejected before the depth check:
    // the one-level limit is for local tasks only
    assertRowEditable(parentTask);

    if (isSubtask(parentTask)) {
      throw new Error('Subtasks cannot create their own subtasks');
    }

    // inherit the parent's due date when none is provided; local tasks always need one
    const dueDate = options.dueDate ?? parentTask.dueDate;
    if (dueDate === null) {
      throw new Error('Subtasks need a due date when their parent task has none');
    }

    const newSubtask = {
      title: options.title,
      description: options.description ?? null,
      status: options.status ?? TaskStatus.NOT_STARTED,
      priority: options.priority ?? TaskPriority.LOW,
      dueDate,
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

  async listTasks(
    filter: TaskFilterOptions = {},
    sort: TaskSortOptions = { sortBy: 'createdAt' },
    page: PageOptions = {},
  ): Promise<Page<Task>> {
    const clauses = [isNull(tasks.archivedAt)];
    if (filter.excludeSubtasks) clauses.push(isNull(tasks.parentTaskId));
    if (filter.excludeClosed) {
      clauses.push(notInArray(tasks.status, [TaskStatus.COMPLETED, TaskStatus.CANCELLED]));
    }

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

    if (filter.origin !== undefined) {
      // only a synced link makes a task external; a detached one is the user's own again
      const isSynced = hasLinkInState('task', tasks.id, LinkState.SYNCED);
      clauses.push(filter.origin === 'external' ? isSynced : not(isSynced));
    }

    let sortColumn: SQLiteColumn;
    switch (sort.sortBy) {
      case 'dueDate':
        sortColumn = tasks.dueDate;
        break;
      case 'priority':
        sortColumn = tasks.priority;
        break;
      case 'status':
        sortColumn = tasks.status;
        break;
      case 'createdAt':
        sortColumn = tasks.createdAt;
        break;
      case 'updatedAt':
        sortColumn = tasks.updatedAt;
        break;
    }

    const pager = keyset<Task>(
      {
        sortKey: sort.sortBy,
        sortColumn,
        idColumn: tasks.id,
        direction: sort.direction === 'asc' ? 'asc' : 'desc',
        sortValue: (row) => row[sortColumn.name as keyof Task],
        id: (row) => row.id,
        // undated rows sort last
        isSortValueNullable: sort.sortBy === 'dueDate',
      },
      page,
    );

    const rows = await this.db
      .select()
      .from(tasks)
      .where(and(...clauses, pager.after))
      .orderBy(...pager.orderBy)
      .limit(pager.fetchLimit);

    // filled after the page is cut, so the lookup covers only the rows returned
    const result = pager.toPage(rows);
    return { ...result, items: await withRefs(this.db, result.items) };
  }

  async listSubtasks(parentTaskId: TaskId, page: PageOptions = {}): Promise<Page<Task>> {
    const pager = keyset<Task>(
      {
        sortKey: 'created',
        sortColumn: tasks.createdAt,
        idColumn: tasks.id,
        direction: 'desc',
        sortValue: (row) => row.createdAt,
        id: (row) => row.id,
      },
      page,
    );

    const rows = await this.db
      .select()
      .from(tasks)
      .where(and(eq(tasks.parentTaskId, parentTaskId), isNull(tasks.archivedAt), pager.after))
      .orderBy(...pager.orderBy)
      .limit(pager.fetchLimit);

    // filled after the page is cut, so the lookup covers only the rows returned
    const result = pager.toPage(rows);
    return { ...result, items: await withRefs(this.db, result.items) };
  }

  async updateTask(id: TaskId, updates: UpdateTaskOptions): Promise<Task | null> {
    await assertEditable(this.db, id);
    const [updatedTask] = await this.db
      .update(tasks)
      .set(updates)
      .where(eq(tasks.id, id))
      .returning();
    return updatedTask ?? null;
  }

  async updateStatus(id: TaskId, newStatus: TaskStatus): Promise<Task> {
    await assertEditable(this.db, id);
    const [row] = await this.db
      .update(tasks)
      .set({
        // if a task is now complete, set a new completedAt timestamp
        // if not, set it to null (this also applies to tasks that were once completed and have their status changed)
        // a cancelled task is closed but not completed, so it keeps completedAt null
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
    // a synced task's project follows the provider; a local one can move into a mirrored project
    assertRowEditable(task);

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

    // links are DevBrain-owned, so allowed on synced tasks; external subtasks carry their own
    if (isSubtask(task) && !isSynced(task)) {
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
    assertRowEditable(task);

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

    // both throw NotFoundError when the id has no active task behind it
    const task = await this.getById(id);
    const parentTask = await this.getById(newParentId);
    // both sides are guarded before the depth checks, which apply to local tasks only
    assertRowEditable(task);
    assertRowEditable(parentTask);

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
