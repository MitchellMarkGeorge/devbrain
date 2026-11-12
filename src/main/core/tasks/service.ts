import { generateId, ProjectId, TaskId } from '@common/ids';
import { tasks } from '@main/db/schema/tasks';
import { projects } from '@main/db/schema/projects';
import { notes } from '@main/db/schema/notes';
import { externalLinks } from '@main/db/schema/integrations';
import { eq, inArray, notInArray, and, isNull, not, SQL, lt, gt, gte, desc } from 'drizzle-orm';
import { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import {
  LinkState,
  Note,
  Page,
  Project,
  ProjectStatus,
  SubtaskListItem,
  Task,
  TaskDeleteResult,
  TaskListItem,
  TaskPriority,
  TaskStatus,
} from '@common/types';
import {
  BulkTaskPatch,
  CreateSubTaskOptions,
  CreateSubtaskTreeOptions,
  CreateTaskOptions,
  CreateTaskTreeOptions,
  TaskFilterOptions,
  TaskSortOptions,
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
import { copyTitle, isSubtask } from './utils';
import { subtreeOf, subtreeOfAll } from './subtree';
import { withListDetails, withSubtaskListDetails } from './details';
import { toExportedTasks } from '../transfer/task-format';
import { taskAsMarkdown } from '../transfer/markdown-copy';
import { SQLiteColumn } from 'drizzle-orm/sqlite-core';
import { localDayWindow } from '../shared/dates';
import { keyset, PageOptions } from '../shared/pagination';
import {
  assertEditable,
  assertRowEditable,
  hasLinkInState,
  isSynced,
  withExternalRef,
  withExternalRefs,
} from '../integrations/refs';
import { ChangeListener, ChangeListeners } from '../shared/changes';

type NewTaskValues = typeof tasks.$inferInsert;
// a transaction's handle, which the reads and writes inside it go through
type Transaction = Parameters<Parameters<BetterSQLite3Database['transaction']>[0]>[0];

// what a subtask takes from its parent
type SubtaskParent = Pick<Task, 'id' | 'dueDate' | 'projectId' | 'linkedNoteId' | 'linkedEventId'>;

// rows per INSERT in createTaskTrees: about 15 bound values each, well under SQLite's limit on
// variables in one statement
const INSERT_CHUNK = 500;

// the status a project made from a task starts in
const PROJECT_STATUS_OF_TASK: Record<TaskStatus, ProjectStatus> = {
  [TaskStatus.NOT_STARTED]: ProjectStatus.NOT_STARTED,
  [TaskStatus.IN_PROGRESS]: ProjectStatus.ACTIVE,
  [TaskStatus.COMPLETED]: ProjectStatus.COMPLETED,
  [TaskStatus.CANCELLED]: ProjectStatus.ON_HOLD,
};

// What convertToProject made and changed, for its `converted` change.
export interface TaskConversion {
  // the task as archived
  task: Task;
  project: Project;
  // the task's subtasks, now top-level tasks of the project
  movedTasks: Task[];
  // the task's task note, now the project's and linked to no task; null when it had none
  note: Note | null;
}

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
    dueDate: options.dueDate ?? null,
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

// The row createSubtask inserts under `parent`.
function newSubtaskValues(parent: SubtaskParent, options: CreateSubTaskOptions): NewTaskValues {
  // left out, the parent's due date (if it has one); null, none
  const dueDate = options.dueDate === undefined ? parent.dueDate : options.dueDate;
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
// the same commit (as an archive does). `converted` names the project a task became and every row
// that conversion changed, after its commit.
export type TaskChange =
  | { type: 'created'; task: Task }
  | { type: 'updated'; task: Task }
  | ({ type: 'converted' } & TaskConversion)
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
   * when one is refused (InvalidInputError). Each is checked and filled as createTask and
   * createSubtask do. A `created` is sent for each task, in the order created, as the transaction's
   * last step, so what listeners write (the search index) commits with the rows.
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
      const created = this.insertRows(tx, rows);
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
    if (filter.noDueDate) clauses.push(isNull(tasks.dueDate));
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

    // a subtask starts in its parent's project but can move to its own, as a Linear sub-issue can
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

  /**
   * Sets `patch` on every task in `ids`, for the selection bar, in one transaction: every task is
   * changed, or none is. Each is checked as its own route checks it, and one refusal fails the
   * batch:
   *
   * - NotFoundError for an id with no active task, or a `projectId` with no active project.
   * - ExternalReadOnlyError for a synced task (its provider owns these fields). The whole batch is
   *   refused rather than skipping it, so the user sees why nothing changed, not a half-applied
   *   selection; detaching it first makes it editable.
   *
   * A status sets completedAt as updateStatus does. An `updated` is sent for each task, in the order
   * of `ids`, as the transaction's last step, so what listeners write (the search index) commits
   * with the rows. Returns the tasks in that order; a repeated id counts once.
   */
  updateTasks(ids: TaskId[], patch: BulkTaskPatch): Task[] {
    const uniqueIds = [...new Set(ids)];
    if (uniqueIds.length === 0) return [];
    const { status, priority, dueDate, projectId } = patch;
    const values: Partial<NewTaskValues> = {};
    if (status !== undefined) {
      values.status = status;
      // a cancelled task is closed but not completed, so it keeps completedAt null
      values.completedAt = status === TaskStatus.COMPLETED ? new Date() : null;
    }
    if (priority !== undefined) values.priority = priority;
    if (dueDate !== undefined) values.dueDate = dueDate;
    if (projectId !== undefined) values.projectId = projectId;
    if (Object.keys(values).length === 0) {
      throw new InvalidInputError('A bulk update needs at least one field to set');
    }

    return this.db.transaction((tx) => {
      const existing = withExternalRefs(
        tx,
        tx
          .select()
          .from(tasks)
          .where(and(inArray(tasks.id, uniqueIds), isNull(tasks.archivedAt)))
          .all(),
      );
      const byId = new Map(existing.map((task) => [task.id, task]));
      for (const id of uniqueIds) {
        const task = byId.get(id);
        if (!task) throw new NotFoundError(id);
        assertRowEditable(task);
      }
      if (projectId) {
        const project = tx
          .select({ id: projects.id })
          .from(projects)
          .where(and(eq(projects.id, projectId), isNull(projects.archivedAt)))
          .get();
        if (!project) throw new NotFoundError(projectId);
      }

      const rows = tx
        .update(tasks)
        .set(values)
        .where(inArray(tasks.id, uniqueIds))
        .returning()
        .all();
      const updatedById = new Map(rows.map((row) => [row.id, row]));
      const updated = uniqueIds.map((id) => ({
        ...updatedById.get(id)!,
        external: byId.get(id)!.external,
      }));
      for (const task of updated) this.changes.emit({ type: 'updated', task });
      return updated;
    });
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
   * Turns a task into a project (the task page's Convert to project), in one transaction:
   *
   * - The project takes the task's title, description, start and due dates, and the colour of the
   *   task's project if it has one. Its status follows the task's (in progress → active, completed
   *   → completed, cancelled → on hold, else not started).
   * - The task's active subtasks become top-level tasks of the project. Their own subtasks stay
   *   under them, and their whole subtrees join the project. They keep the event or note link they
   *   took from the task, as a promoted subtask does.
   * - The task's task note (the note whose `linkedTaskId` is the task) moves to the project and
   *   links to no task, so archiving the task leaves it out.
   * - The task is archived (it can be restored from the trash). It keeps its own link: a project
   *   has none. Its favorite moves to the project: the project is what the user starred now.
   *
   * One `converted` change is sent after the commit. Returns the new project. Throws NotFoundError
   * for an unknown or archived task, and ExternalReadOnlyError for a synced one: its provider owns
   * it, so it is detached first.
   */
  convertToProject(id: TaskId): Project {
    const conversion = this.db.transaction((tx): TaskConversion => {
      const row = tx
        .select()
        .from(tasks)
        .where(and(eq(tasks.id, id), isNull(tasks.archivedAt)))
        .get();
      if (!row) throw new NotFoundError(id);
      assertRowEditable(withExternalRef(tx, row));

      const color = row.projectId
        ? (tx
            .select({ color: projects.color })
            .from(projects)
            .where(eq(projects.id, row.projectId))
            .get()?.color ?? null)
        : null;
      const now = new Date();
      const status = PROJECT_STATUS_OF_TASK[row.status];
      const projectRow = tx
        .insert(projects)
        .values({
          title: row.title,
          description: row.description,
          startDate: row.startDate,
          dueDate: row.dueDate,
          color,
          status,
          completedAt: status === ProjectStatus.COMPLETED ? (row.completedAt ?? now) : null,
          favoritedAt: row.favoritedAt,
        })
        .returning()
        .get();

      const childIds = tx
        .select({ id: tasks.id })
        .from(tasks)
        .where(and(eq(tasks.parentTaskId, id), isNull(tasks.archivedAt)))
        .all()
        .map((child) => child.id);
      let movedRows: Task[] = [];
      if (childIds.length > 0) {
        // archived rows in their subtrees too, so a restore puts them back in the project
        tx.update(tasks)
          .set({ projectId: projectRow.id })
          .where(inArray(tasks.id, subtreeOfAll(childIds)))
          .run();
        movedRows = tx
          .update(tasks)
          .set({ parentTaskId: null })
          .where(inArray(tasks.id, childIds))
          .returning()
          .all();
      }

      const note =
        tx
          .update(notes)
          .set({ projectId: projectRow.id, linkedTaskId: null })
          .where(and(eq(notes.linkedTaskId, id), isNull(notes.archivedAt)))
          .returning()
          .get() ?? null;

      // what is left below the task is archived already, so only its own row changes
      const archived = tx
        .update(tasks)
        .set({ archivedAt: now, favoritedAt: null })
        .where(eq(tasks.id, id))
        .returning()
        .get();

      return {
        task: withExternalRef(tx, archived),
        project: { ...projectRow, external: null },
        movedTasks: withExternalRefs(tx, movedRows),
        note,
      };
    });
    this.changes.emit({ type: 'converted', ...conversion });
    return conversion.project;
  }

  /**
   * Copies a task with its active subtasks at any depth (the menus' Duplicate), in one
   * transaction. The copy is titled "Copy of …"; its subtasks keep their titles. Every other field
   * is copied as it is: status (and completedAt), priority, dates, project, link and pull request.
   * Its favorite, views and task note are not: a task has at most one task note.
   *
   * A copy is always local: a synced task (and its synced subtree) is copied as local tasks, which
   * sync never touches. A subtask's copy goes under the same parent, unless that parent is synced
   * (a synced task only has synced tasks below it): then it is a top-level task.
   *
   * A `created` is sent for each new task after the commit, the copy first. Returns the copy.
   * Throws NotFoundError for an unknown or archived task.
   */
  duplicateTask(id: TaskId): Task {
    const created = this.db.transaction((tx) => {
      const subtree = tx
        .select()
        .from(tasks)
        .where(and(inArray(tasks.id, subtreeOf(id)), isNull(tasks.archivedAt)))
        .orderBy(tasks.createdAt, tasks.id)
        .all();
      const root = subtree.find((row) => row.id === id);
      if (!root) throw new NotFoundError(id);

      let parentTaskId: TaskId | null = null;
      if (root.parentTaskId) {
        const parent = tx
          .select()
          .from(tasks)
          .where(and(eq(tasks.id, root.parentTaskId), isNull(tasks.archivedAt)))
          .get();
        if (parent && !isSynced(withExternalRef(tx, parent))) parentTaskId = parent.id;
      }

      const childrenOf = new Map<TaskId, Task[]>();
      for (const row of subtree) {
        if (row.id === id || !row.parentTaskId) continue;
        childrenOf.set(row.parentTaskId, [...(childrenOf.get(row.parentTaskId) ?? []), row]);
      }
      // parents before their subtasks, so each parent row exists when its subtasks go in; a row
      // under an archived task is not reached, as it is not shown under the task
      const rows: (NewTaskValues & { id: TaskId })[] = [];
      const copy = (row: Task, newParentId: TaskId | null, title: string) => {
        const newId = generateId('task');
        rows.push({
          id: newId,
          title,
          description: row.description,
          status: row.status,
          priority: row.priority,
          startDate: row.startDate,
          dueDate: row.dueDate,
          parentTaskId: newParentId,
          projectId: row.projectId,
          linkedEventId: row.linkedEventId,
          linkedNoteId: row.linkedNoteId,
          pullRequestUrl: row.pullRequestUrl,
          completedAt: row.completedAt,
        });
        for (const child of childrenOf.get(row.id) ?? []) copy(child, newId, child.title);
      };
      copy(root, parentTaskId, copyTitle(root.title));
      return this.insertRows(tx, rows);
    });
    for (const task of created) this.changes.emit({ type: 'created', task });
    return created[0];
  }

  /**
   * An active task as Markdown (Copy as Markdown): its title, properties and description, then its
   * active subtasks at any depth as a checklist, oldest first. Throws NotFoundError for an unknown
   * or archived task.
   */
  toMarkdown(id: TaskId): string {
    const rows = this.db
      .select()
      .from(tasks)
      .where(and(inArray(tasks.id, subtreeOf(id)), isNull(tasks.archivedAt)))
      .orderBy(tasks.createdAt, tasks.id)
      .all();
    // a subtask under an archived one would come out as a tree of its own; only the task's is kept
    const task = toExportedTasks(withListDetails(this.db, rows)).find((root) => root.id === id);
    if (!task) throw new NotFoundError(id);
    return taskAsMarkdown(task);
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

  // Inserts new local task rows a few hundred per statement, parents before their subtasks, and
  // returns them as tasks in the order given.
  private insertRows(tx: Transaction, rows: (NewTaskValues & { id: TaskId })[]): Task[] {
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
    return rows.map(({ id }) => inserted.get(id)!);
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
