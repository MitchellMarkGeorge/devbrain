import { ProjectId, TaskId } from '@common/ids';
import { tasks } from '@main/db/schema/tasks';
import { eq, inArray, notInArray, and, isNull, not, SQL, lt, gt, gte, desc } from 'drizzle-orm';
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
import { InvalidInputError, NotFoundError, TaskHierarchyError } from '../shared/errors';
import { isSubtask } from './utils';
import { subtreeOf } from './subtree';
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
import { ChangeListener, ChangeListeners } from '../shared/changes';

// What a write changed, for in-process subscribers: the workspace keeps search in step, and the IPC
// layer will forward them to the renderer. Sent after the write commits, with the row as written.
export type TaskChange = { type: 'created'; task: Task } | { type: 'updated'; task: Task };

export class TaskService {
  private readonly changes = new ChangeListeners<TaskChange>('Task');

  constructor(private readonly db: BetterSQLite3Database) {}

  // returns a function that unsubscribes the listener
  onChange(listener: ChangeListener<TaskChange>): () => void {
    return this.changes.add(listener);
  }

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
      throw new InvalidInputError('Tasks cannot be linked to both an event and a note');
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

    const [row] = await this.db.insert(tasks).values(newTask).returning();
    // a new task is local, so it has no link
    const insertedTask = { ...row, external: null };
    this.changes.emit({ type: 'created', task: insertedTask });
    return insertedTask;
  }

  async createSubtask(parentTaskId: TaskId, options: CreateSubTaskOptions): Promise<Task> {
    // throws NotFoundError when no task matches the provided id
    const parentTask = await this.getById(parentTaskId);
    // a synced parent's subtree is provider-owned; local subtasks nest at any depth
    assertRowEditable(parentTask);

    // inherit the parent's due date when none is provided; local tasks always need one
    const dueDate = options.dueDate ?? parentTask.dueDate;
    if (dueDate === null) {
      throw new TaskHierarchyError(
        parentTaskId,
        'due_date_required',
        'Subtasks need a due date when their parent task has none',
      );
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
    const [row] = await this.db.insert(tasks).values(newSubtask).returning();
    const insertedTask = { ...row, external: null };
    this.changes.emit({ type: 'created', task: insertedTask });
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

  async updateTask(id: TaskId, updates: UpdateTaskOptions): Promise<Task> {
    assertEditable(this.db, id);
    const [row] = await this.db.update(tasks).set(updates).where(eq(tasks.id, id)).returning();
    return this.updated(id, row);
  }

  async updateStatus(id: TaskId, newStatus: TaskStatus): Promise<Task> {
    assertEditable(this.db, id);
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
    return this.updated(id, row);
  }

  async updateProject(id: TaskId, projectId: ProjectId | null): Promise<Task> {
    const task = await this.getById(id);
    // a synced task's project follows the provider; a local one can move into a mirrored project
    assertRowEditable(task);

    if (isSubtask(task)) {
      throw new TaskHierarchyError(
        id,
        'inherits_context',
        'Subtasks inherit project context from partent task',
      );
    }

    const [row] = await this.db
      .update(tasks)
      .set({
        projectId,
      })
      .where(eq(tasks.id, id))
      .returning();
    return this.updated(id, row);
  }

  async updateLinks(id: TaskId, options: UpdateTaskLinkOptions): Promise<Task> {
    const task = await this.getById(id);

    // links are DevBrain-owned, so allowed on synced tasks; external subtasks carry their own
    if (isSubtask(task) && !isSynced(task)) {
      throw new TaskHierarchyError(
        id,
        'inherits_context',
        'Subtasks inherit link context from partent task',
      );
    }

    if (options.linkedEventId && options.linkedNoteId) {
      throw new InvalidInputError('Tasks cannot be linked to both an event and a note');
    }

    const [row] = await this.db
      .update(tasks)
      .set({
        linkedEventId: options.linkedEventId ?? null,
        linkedNoteId: options.linkedNoteId ?? null,
      })
      .where(eq(tasks.id, id))
      .returning();
    return this.updated(id, row);
  }

  async promoteSubtask(id: TaskId): Promise<Task> {
    // makes an existing subtask a top level task
    const task = await this.getById(id);
    assertRowEditable(task);

    if (!isSubtask(task)) {
      throw new TaskHierarchyError(id, 'not_subtask', 'Task is not a subtask');
    }

    const [row] = await this.db
      .update(tasks)
      .set({
        parentTaskId: null,
      })
      .where(eq(tasks.id, id))
      .returning();
    return this.updated(id, row);
  }

  async demoteTask(id: TaskId, newParentId: TaskId): Promise<Task> {
    // makes an existing top level task a subtask of another task
    // the existing task will inherit the context if its new parent, even if already has its own
    if (id === newParentId) {
      throw new TaskHierarchyError(id, 'cycle', 'Tasks cannot be their own parent');
    }

    // both throw NotFoundError when the id has no active task behind it
    const task = await this.getById(id);
    const parentTask = await this.getById(newParentId);
    // both sides are guarded; local tasks nest at any depth
    assertRowEditable(task);
    assertRowEditable(parentTask);

    const [cycle] = await this.db
      .select({ id: tasks.id })
      .from(tasks)
      .where(and(eq(tasks.id, newParentId), inArray(tasks.id, subtreeOf(id))))
      .limit(1);
    if (cycle) {
      throw new TaskHierarchyError(
        id,
        'cycle',
        'Tasks cannot become a subtask of their own subtask',
      );
    }

    const row = this.db.transaction((tx) => {
      // the whole subtree takes on the new parent's context, so it stays consistent with its root
      tx.update(tasks)
        .set({
          // override all previous context (WARN THE USER)
          projectId: parentTask.projectId,
          linkedNoteId: parentTask.linkedNoteId,
          linkedEventId: parentTask.linkedEventId,
        })
        .where(inArray(tasks.id, subtreeOf(id)))
        .run();

      return tx
        .update(tasks)
        .set({ parentTaskId: newParentId })
        .where(eq(tasks.id, id))
        .returning()
        .get();
    });
    // only the demoted task is sent: its subtree's new context changes nothing searchable
    return this.updated(id, row);
  }

  // An update's result as every read returns it, with `external`, after sending the change. Throws
  // NotFoundError when the update matched no row.
  private async updated(id: TaskId, row: Task | undefined): Promise<Task> {
    if (!row) throw new NotFoundError(id);
    const task = await withRef(this.db, row);
    this.changes.emit({ type: 'updated', task });
    return task;
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
