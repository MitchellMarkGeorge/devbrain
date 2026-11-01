import { generateId, ProjectId, TaskId } from '@common/ids';
import { tasks } from '@main/db/schema/tasks';
import { notes } from '@main/db/schema/notes';
import { externalLinks } from '@main/db/schema/integrations';
import { eq, inArray, notInArray, and, isNull, not, SQL, lt, gt, gte, desc } from 'drizzle-orm';
import { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import {
  CreateSubTaskOptions,
  CreateSubtaskTreeOptions,
  CreateTaskOptions,
  CreateTaskTreeOptions,
  Task,
  TaskFilterOptions,
  SubtaskListItem,
  TaskListItem,
  TaskPriority,
  TaskDeleteResult,
  TaskSortOptions,
  TaskStatus,
  UpdateTaskLinkOptions,
  UpdateTaskOptions,
} from './types';
import {
  ExternalReadOnlyError,
  InvalidInputError,
  NotArchivedError,
  NotFoundError,
  TaskHierarchyError,
} from '../shared/errors';
import { isSubtask } from './utils';
import { subtreeOf } from './subtree';
import { withListDetails, withSubtaskListDetails } from './details';
import { SQLiteColumn } from 'drizzle-orm/sqlite-core';
import { localDayWindow } from '../shared/dates';
import { keyset, Page, PageOptions } from '../shared/pagination';
import {
  assertEditable,
  assertRowEditable,
  hasLinkInState,
  isSynced,
  withExternalRef,
  withExternalRefs,
} from '../integrations/refs';
import { LinkState } from '../integrations/types';
import { ChangeListener, ChangeListeners } from '../shared/changes';

type NewTaskValues = typeof tasks.$inferInsert;

// what a subtask takes from its parent
type SubtaskParent = Pick<Task, 'id' | 'dueDate' | 'projectId' | 'linkedNoteId' | 'linkedEventId'>;

// rows per INSERT in createTaskTrees: about 15 bound values each, well under SQLite's limit on
// variables in one statement
const INSERT_CHUNK = 500;

// The row createTask inserts: a local top-level task. Throws InvalidInputError for both links.
function newTaskValues(options: CreateTaskOptions): NewTaskValues {
  if (options.linkedEventId && options.linkedNoteId) {
    throw new InvalidInputError('Tasks cannot be linked to both an event and a note');
  }
  return {
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
    pullRequestUrl: options.pullRequestUrl ?? null,
    completedAt: options.status === TaskStatus.COMPLETED ? new Date() : null,
  };
}

// The row createSubtask inserts under `parent`. Throws TaskHierarchyError when neither has a due
// date.
function newSubtaskValues(parent: SubtaskParent, options: CreateSubTaskOptions): NewTaskValues {
  // inherit the parent's due date when none is provided; local tasks always need one
  const dueDate = options.dueDate ?? parent.dueDate;
  if (dueDate === null) {
    throw new TaskHierarchyError(
      parent.id,
      'due_date_required',
      'Subtasks need a due date when their parent task has none',
    );
  }
  return {
    title: options.title,
    description: options.description ?? null,
    status: options.status ?? TaskStatus.NOT_STARTED,
    priority: options.priority ?? TaskPriority.LOW,
    dueDate,
    startDate: options.startDate ?? null,
    // inherit the parents context by default
    parentTaskId: parent.id,
    projectId: parent.projectId,
    linkedNoteId: parent.linkedNoteId,
    linkedEventId: parent.linkedEventId,
    pullRequestUrl: options.pullRequestUrl ?? null,
    completedAt: options.status === TaskStatus.COMPLETED ? new Date() : null,
  };
}

// What a write changed, for in-process subscribers: the workspace keeps search in step, and the IPC
// layer will forward them to the renderer. Sent after the write commits, with the row as written.
// `deleted` is sent as the delete's last step, inside its transaction, so search drops the rows in
// the same commit (as an archive does).
export type TaskChange =
  | { type: 'created'; task: Task }
  | { type: 'updated'; task: Task }
  | ({ type: 'deleted' } & TaskDeleteResult);

export class TaskService {
  private readonly changes = new ChangeListeners<TaskChange>('Task');

  constructor(private readonly db: BetterSQLite3Database) {}

  // returns a function that unsubscribes the listener
  onChange(listener: ChangeListener<TaskChange>): () => void {
    return this.changes.add(listener);
  }

  getById(id: TaskId): Task {
    const row = this.activeTasks(eq(tasks.id, id)).limit(1).get();
    if (!row) throw new NotFoundError(id);
    return withExternalRef(this.db, row);
  }

  getByIds(ids: TaskId[]): Task[] {
    return withExternalRefs(this.db, this.activeTasks(inArray(tasks.id, ids)).all());
  }

  // a local task can be created in a mirrored project: it stays local and sync never touches it
  createTask(options: CreateTaskOptions): Task {
    const row = this.db.insert(tasks).values(newTaskValues(options)).returning().get();
    // a new task is local, so it has no link
    const insertedTask = { ...row, external: null };
    this.changes.emit({ type: 'created', task: insertedTask });
    return insertedTask;
  }

  createSubtask(parentTaskId: TaskId, options: CreateSubTaskOptions): Task {
    // throws NotFoundError when no task matches the provided id
    const parentTask = this.getById(parentTaskId);
    // a synced parent's subtree is provider-owned; local subtasks nest at any depth
    assertRowEditable(parentTask);

    const row = this.db
      .insert(tasks)
      .values(newSubtaskValues(parentTask, options))
      .returning()
      .get();
    const insertedTask = { ...row, external: null };
    this.changes.emit({ type: 'created', task: insertedTask });
    return insertedTask;
  }

  /**
   * Creates tasks with their subtrees, all in one transaction: every task is created, or none is
   * when one is refused (InvalidInputError, TaskHierarchyError). Each is checked and filled as
   * createTask and createSubtask do. A `created` is sent for each task, in the order created, as the
   * transaction's last step, so what listeners write (the search index) commits with the rows.
   * Returns the tasks in that order: each before its subtasks, depth first.
   */
  createTaskTrees(trees: CreateTaskTreeOptions[]): Task[] {
    // Every row is built first, its id generated so its subtasks can name it, parents before their
    // subtasks; then they go in a few hundred per statement. One insert per row would cost an
    // import of the largest size several seconds.
    const rows: (NewTaskValues & { id: TaskId })[] = [];
    const add = (values: NewTaskValues): SubtaskParent => {
      const row = { ...values, id: generateId('task') };
      rows.push(row);
      return {
        id: row.id,
        dueDate: row.dueDate ?? null,
        projectId: row.projectId ?? null,
        linkedNoteId: row.linkedNoteId ?? null,
        linkedEventId: row.linkedEventId ?? null,
      };
    };
    const addSubtasks = (parent: SubtaskParent, subtasks: CreateSubtaskTreeOptions[] = []) => {
      for (const subtask of subtasks) {
        addSubtasks(add(newSubtaskValues(parent, subtask)), subtask.subtasks);
      }
    };
    for (const tree of trees) addSubtasks(add(newTaskValues(tree)), tree.subtasks);

    return this.db.transaction((tx) => {
      const inserted = new Map<TaskId, Task>();
      for (let i = 0; i < rows.length; i += INSERT_CHUNK) {
        const chunk = tx
          .insert(tasks)
          .values(rows.slice(i, i + INSERT_CHUNK))
          .returning()
          .all();
        for (const row of chunk) inserted.set(row.id, { ...row, external: null });
      }
      // RETURNING gives no order, so the tasks are put back in the order built
      const created = rows.map(({ id }) => inserted.get(id)!);
      for (const task of created) this.changes.emit({ type: 'created', task });
      return created;
    });
  }

  listTasks(
    filter: TaskFilterOptions = {},
    sort: TaskSortOptions = { sortBy: 'createdAt' },
    page: PageOptions = {},
  ): Page<TaskListItem> {
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

    const rows = this.db
      .select()
      .from(tasks)
      .where(and(...clauses, pager.after))
      .orderBy(...pager.orderBy)
      .limit(pager.fetchLimit)
      .all();

    // filled after the page is cut, so the lookups cover only the rows returned
    const result = pager.toPage(rows);
    return { ...result, items: withListDetails(this.db, result.items) };
  }

  listSubtasks(parentTaskId: TaskId, page: PageOptions = {}): Page<SubtaskListItem> {
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

    const rows = this.db
      .select()
      .from(tasks)
      .where(and(eq(tasks.parentTaskId, parentTaskId), isNull(tasks.archivedAt), pager.after))
      .orderBy(...pager.orderBy)
      .limit(pager.fetchLimit)
      .all();

    // filled after the page is cut, so the lookups cover only the rows returned
    const result = pager.toPage(rows);
    return { ...result, items: withSubtaskListDetails(this.db, result.items) };
  }

  updateTask(id: TaskId, updates: UpdateTaskOptions): Task {
    assertEditable(this.db, id);
    const row = this.db.update(tasks).set(updates).where(eq(tasks.id, id)).returning().get();
    return this.updated(id, row);
  }

  updateStatus(id: TaskId, newStatus: TaskStatus): Task {
    assertEditable(this.db, id);
    const row = this.db
      .update(tasks)
      .set({
        // if a task is now complete, set a new completedAt timestamp
        // if not, set it to null (this also applies to tasks that were once completed and have their status changed)
        // a cancelled task is closed but not completed, so it keeps completedAt null
        completedAt: newStatus === TaskStatus.COMPLETED ? new Date() : null,
        status: newStatus,
      })
      .where(eq(tasks.id, id))
      .returning()
      .get();

    // if all the tasks in a project are marked as completed, then the project shoudl be marked as completed
    // this shoudl also happen vice versa
    return this.updated(id, row);
  }

  updateProject(id: TaskId, projectId: ProjectId | null): Task {
    const task = this.getById(id);
    // a synced task's project follows the provider; a local one can move into a mirrored project
    assertRowEditable(task);

    if (isSubtask(task)) {
      throw new TaskHierarchyError(
        id,
        'inherits_context',
        'Subtasks inherit project context from partent task',
      );
    }

    const row = this.db
      .update(tasks)
      .set({
        projectId,
      })
      .where(eq(tasks.id, id))
      .returning()
      .get();
    return this.updated(id, row);
  }

  updateLinks(id: TaskId, options: UpdateTaskLinkOptions): Task {
    const task = this.getById(id);

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

    const row = this.db
      .update(tasks)
      .set({
        linkedEventId: options.linkedEventId ?? null,
        linkedNoteId: options.linkedNoteId ?? null,
      })
      .where(eq(tasks.id, id))
      .returning()
      .get();
    return this.updated(id, row);
  }

  promoteSubtask(id: TaskId): Task {
    // makes an existing subtask a top level task
    const task = this.getById(id);
    assertRowEditable(task);

    if (!isSubtask(task)) {
      throw new TaskHierarchyError(id, 'not_subtask', 'Task is not a subtask');
    }

    const row = this.db
      .update(tasks)
      .set({
        parentTaskId: null,
      })
      .where(eq(tasks.id, id))
      .returning()
      .get();
    return this.updated(id, row);
  }

  demoteTask(id: TaskId, newParentId: TaskId): Task {
    // makes an existing top level task a subtask of another task
    // the existing task will inherit the context if its new parent, even if already has its own
    if (id === newParentId) {
      throw new TaskHierarchyError(id, 'cycle', 'Tasks cannot be their own parent');
    }

    // both throw NotFoundError when the id has no active task behind it
    const task = this.getById(id);
    const parentTask = this.getById(newParentId);
    // both sides are guarded; local tasks nest at any depth
    assertRowEditable(task);
    assertRowEditable(parentTask);

    const cycle = this.db
      .select({ id: tasks.id })
      .from(tasks)
      .where(and(eq(tasks.id, newParentId), inArray(tasks.id, subtreeOf(id))))
      .limit(1)
      .get();
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

  /**
   * Deletes an archived task for good (the UI calls archived items "in the trash"; deleting is
   * only offered there), with every task below it at any depth: the `parentTaskId` foreign key
   * cascades. The task and everything below it must be archived, or it throws NotArchivedError:
   * archiving takes the whole subtree along, but sync archives a removed task on its own and can
   * leave synced subtasks live under it, which a delete must not take with it.
   *
   * What only pointed at them is kept, by the foreign keys' `set null`: their task notes lose
   * `linkedTaskId` (so a task still has at most one task note, now none), and nothing else links to
   * a task. Their external links cascade; favorites and recents are columns of the rows and go
   * with them.
   *
   * Synced tasks: a synced task belongs to its provider, is never archived, and leaves only
   * through sync; it is refused (ExternalReadOnlyError is checked too, as archive does). A detached
   * task is the user's own copy, and deleting it deletes only that copy: nothing is recorded for
   * sync. If the provider later sends the same item again (it is still assigned and changes, or is
   * assigned again), sync treats it as never mirrored and adds it as a new synced task. The same
   * holds for a removed task (archived by sync).
   *
   * Throws NotFoundError for an unknown id, and NotArchivedError for one not in the trash.
   */
  deleteTask(id: TaskId): TaskDeleteResult {
    return this.db.transaction((tx) => {
      // the task first: subtreeOf starts from the id itself
      const subtree = tx
        .select({
          taskId: tasks.id,
          archivedAt: tasks.archivedAt,
          state: externalLinks.state,
        })
        .from(tasks)
        .leftJoin(externalLinks, eq(externalLinks.taskId, tasks.id))
        .where(inArray(tasks.id, subtreeOf(id)))
        .all();
      if (!subtree.some((row) => row.taskId === id)) throw new NotFoundError(id);
      if (subtree.some((row) => row.archivedAt === null)) throw new NotArchivedError(id);
      // a synced task is never archived; checked anyway, as archive does
      if (subtree.some((row) => row.state === LinkState.SYNCED)) {
        throw new ExternalReadOnlyError(id);
      }

      const taskIds = [id, ...subtree.map((row) => row.taskId).filter((taskId) => taskId !== id)];
      // read before the delete clears their link
      const unlinkedNoteIds = tx
        .select({ id: notes.id })
        .from(notes)
        .where(inArray(notes.linkedTaskId, taskIds))
        .all()
        .map((row) => row.id);

      tx.delete(tasks).where(inArray(tasks.id, taskIds)).run();

      const result: TaskDeleteResult = { taskIds, unlinkedNoteIds };
      this.changes.emit({ type: 'deleted', ...result });
      return result;
    });
  }

  // An update's result as every read returns it, with `external`, after sending the change. Throws
  // NotFoundError when the update matched no row.
  private updated(id: TaskId, row: Task | undefined): Task {
    if (!row) throw new NotFoundError(id);
    const task = withExternalRef(this.db, row);
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
