import type { NoteId, ProjectId, TaskId } from '@common/ids';
import {
  listOf,
  ProjectStatus,
  TaskPriority,
  TaskStatus,
  type NoteLinkKind,
  type NoteListItem,
  type OneOrMany,
  type Project,
  type ProjectStats,
  type Task,
  type TaskListItem,
  type TaskTreeItem,
} from '@common/types';

// The tasks a fake main's workspace holds, answering the tasks routes the pages call as core
// does where the pages can tell (filters, the one-task routes, favorites), and simply elsewhere
// (one page, no sort beyond the order given).

const EPOCH = new Date(2026, 5, 22, 9);

function startOfToday(): Date {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), now.getDate());
}

/** A task as `tasks.list` returns it, with defaults for what's left out. */
export function fakeTask(
  id: string,
  title: string,
  extra: Partial<TaskListItem> = {},
): TaskListItem {
  return {
    id: id as TaskId,
    title,
    description: null,
    priority: TaskPriority.LOW,
    status: TaskStatus.NOT_STARTED,
    startDate: null,
    dueDate: null,
    parentTaskId: null,
    projectId: null,
    linkedEventId: null,
    linkedNoteId: null,
    pullRequestUrl: null,
    external: null,
    subtaskProgress: null,
    project: null,
    link: null,
    parentTask: null,
    createdAt: EPOCH,
    updatedAt: EPOCH,
    favoritedAt: null,
    viewedAt: null,
    archivedAt: null,
    completedAt: null,
    ...extra,
  };
}

export function fakeProject(id: string, title: string, extra: Partial<Project> = {}): Project {
  return {
    id: id as ProjectId,
    title,
    description: null,
    status: ProjectStatus.ACTIVE,
    color: '#2b7fff',
    startDate: null,
    dueDate: null,
    createdAt: EPOCH,
    updatedAt: EPOCH,
    favoritedAt: null,
    viewedAt: null,
    archivedAt: null,
    completedAt: null,
    ...extra,
  } as Project;
}

/** A note as `notes.list` returns it. */
export function fakeNote(
  id: string,
  title: string,
  extra: Partial<NoteListItem> = {},
): NoteListItem {
  return {
    id: id as NoteId,
    title,
    preview: null,
    projectId: null,
    linkedEventId: null,
    linkedTaskId: null,
    project: null,
    link: null,
    createdAt: EPOCH,
    updatedAt: EPOCH,
    favoritedAt: null,
    viewedAt: null,
    archivedAt: null,
    ...extra,
  };
}

type Filter = {
  status?: TaskStatus;
  priority?: OneOrMany<TaskPriority>;
  projectId?: OneOrMany<ProjectId | null>;
  excludeClosed?: boolean;
  excludeSubtasks?: boolean;
  noDueDate?: boolean;
  noteId?: NoteId | null;
  dueBefore?: Date;
  dueAfter?: Date;
  eventId?: string | null;
  dueOn?: Date;
};

type NoteFilter = {
  projectId?: OneOrMany<ProjectId | null>;
  linkedEventId?: string | null;
  linkedTaskId?: string | null;
  linkedTo?: OneOrMany<NoteLinkKind>;
  editedFrom?: Date;
  editedBefore?: Date;
  hasTasks?: boolean;
};

// a filter that takes one value or a list, as core's does: any of them
const isOneOf = <T>(value: T, wanted: OneOrMany<T> | undefined) =>
  wanted === undefined || listOf(wanted).includes(value);

// core's `linkedTo`: linked to an event, to a task, or to neither; a list is any of those
function linkedToAny(note: NoteListItem, wanted: OneOrMany<NoteLinkKind> | undefined): boolean {
  if (wanted === undefined) return true;
  const kinds = listOf(wanted);
  return (
    (kinds.includes('event') && note.linkedEventId !== null) ||
    (kinds.includes('task') && note.linkedTaskId !== null) ||
    (kinds.includes('none') && note.linkedEventId === null && note.linkedTaskId === null)
  );
}

const sameDay = (a: Date, b: Date) => a.toDateString() === b.toDateString();

const CLOSED = [TaskStatus.COMPLETED, TaskStatus.CANCELLED];

export class FakeTasks {
  constructor(
    public tasks: TaskListItem[] = [],
    public projects: Project[] = [],
    public notes: NoteListItem[] = [],
  ) {}

  /** each note's markdown, by id */
  readonly contents = new Map<string, string>();

  // an active project, or with `includeArchived` one in the trash too, as core's getById
  findProject(id: unknown, { includeArchived = false } = {}): Project | undefined {
    return this.projects.find(
      (project) => project.id === id && (includeArchived || project.archivedAt === null),
    );
  }

  /** a project's counts of its active tasks, as core's projects.stats */
  statsOf(id: unknown): ProjectStats {
    const tasks = this.tasks.filter((t) => t.projectId === id && t.archivedAt === null);
    const count = (status: TaskStatus) => tasks.filter((t) => t.status === status).length;
    return {
      numOfNotStarted: count(TaskStatus.NOT_STARTED),
      numOfInProgress: count(TaskStatus.IN_PROGRESS),
      numOfCompleted: count(TaskStatus.COMPLETED),
      numOfCancelled: count(TaskStatus.CANCELLED),
      // due before today and open, as core counts it
      numOfOverdue: tasks.filter(
        (t) =>
          t.dueDate !== null &&
          t.dueDate < startOfToday() &&
          t.status !== TaskStatus.COMPLETED &&
          t.status !== TaskStatus.CANCELLED,
      ).length,
      totalTasks: tasks.length - count(TaskStatus.CANCELLED),
    };
  }

  createProject(fields: Partial<Project> & { title: string }): Project {
    const project = fakeProject(`prj_new${this.projects.length + 1}`, fields.title, {
      status: ProjectStatus.NOT_STARTED,
      ...fields,
    });
    this.projects.push(project);
    return project;
  }

  find(id: unknown): TaskListItem | undefined {
    return this.tasks.find((task) => task.id === id && task.archivedAt === null);
  }

  list(filter: Filter = {}): TaskListItem[] {
    return this.tasks.filter(
      (task) =>
        task.archivedAt === null &&
        (filter.status === undefined || task.status === filter.status) &&
        isOneOf(task.priority, filter.priority) &&
        isOneOf(task.projectId, filter.projectId) &&
        (!filter.excludeClosed || !CLOSED.includes(task.status)) &&
        (!filter.excludeSubtasks || task.parentTaskId === null) &&
        (!filter.noDueDate || task.dueDate === null) &&
        (filter.noteId === undefined || task.linkedNoteId === filter.noteId) &&
        (filter.dueBefore === undefined ||
          (task.dueDate !== null && task.dueDate < filter.dueBefore)) &&
        (filter.dueAfter === undefined ||
          (task.dueDate !== null && task.dueDate > filter.dueAfter)) &&
        (filter.eventId === undefined || task.linkedEventId === filter.eventId) &&
        (filter.dueOn === undefined ||
          (task.dueDate !== null && sameDay(task.dueDate, filter.dueOn))),
    );
  }

  /**
   * `tasks.tree`: the listed tasks as core's tree, each subtask under its parent (in the order
   * given) and one whose parent is filtered out a root. A root with more than 50 subtasks comes
   * alone, with `subtreeSize`, as core sends it.
   */
  tree(filter: Filter = {}): TaskTreeItem[] {
    const listed = this.list(filter);
    const ids = new Set(listed.map((task) => task.id as string));
    const out: TaskTreeItem[] = [];
    for (const task of listed) {
      if (task.parentTaskId && ids.has(task.parentTaskId)) continue;
      const below = this.under(task.id, listed, 1);
      if (below.length > 50) out.push({ ...task, depth: 0, subtreeSize: below.length });
      else out.push({ ...task, depth: 0, subtreeSize: null }, ...below);
    }
    return out;
  }

  /** `tasks.subtree`: a root's listed descendants in tree order, its subtasks at depth 1. */
  subtree(id: unknown, filter: Filter = {}): TaskTreeItem[] {
    return this.under(id, this.list(filter), 1);
  }

  // the tasks under `id` among `listed`, in tree order, from `depth`
  private under(id: unknown, listed: TaskListItem[], depth: number): TaskTreeItem[] {
    return listed
      .filter((task) => task.parentTaskId === id)
      .flatMap((task) => [
        { ...task, depth, subtreeSize: null },
        ...this.under(task.id, listed, depth + 1),
      ]);
  }

  /** `notes.list`: the notes not in the trash, filtered as core does, the newest edit first. */
  listNotes(filter: NoteFilter = {}): NoteListItem[] {
    return this.notes
      .filter(
        (note) =>
          note.archivedAt === null &&
          isOneOf(note.projectId, filter.projectId) &&
          (filter.linkedEventId === undefined || note.linkedEventId === filter.linkedEventId) &&
          (filter.linkedTaskId === undefined || note.linkedTaskId === filter.linkedTaskId) &&
          linkedToAny(note, filter.linkedTo) &&
          (filter.editedFrom === undefined || note.updatedAt >= filter.editedFrom) &&
          (filter.editedBefore === undefined || note.updatedAt < filter.editedBefore) &&
          (filter.hasTasks === undefined ||
            this.tasks.some((task) => task.linkedNoteId === note.id) === filter.hasTasks),
      )
      .sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime());
  }

  /** Changes a note's fields, its `project` and `link` with them, as core's row would be. */
  patchNote(id: unknown, fields: Partial<NoteListItem>): NoteListItem {
    const note = this.notes.find((n) => n.id === id);
    if (!note) throw new Error(`${String(id)} not found`);
    Object.assign(note, fields, { updatedAt: new Date() });
    const project = this.projects.find((p) => p.id === note.projectId);
    note.project = project ? { id: project.id, title: project.title, color: project.color } : null;
    const task = this.tasks.find((t) => t.id === note.linkedTaskId);
    note.link = task
      ? { type: 'task', id: task.id, title: task.title, status: task.status }
      : note.link?.type === 'event' && note.linkedEventId === note.link.id
        ? note.link
        : null;
    return note;
  }

  subtasks(id: unknown): TaskListItem[] {
    return this.tasks.filter((task) => task.parentTaskId === id && task.archivedAt === null);
  }

  patch(id: unknown, fields: Partial<TaskListItem>): Task {
    const task = this.find(id);
    if (!task) throw new Error(`${String(id)} not found`);
    Object.assign(task, fields, { updatedAt: new Date() });
    if (fields.projectId !== undefined) {
      const project = this.projects.find((p) => p.id === fields.projectId);
      task.project = project
        ? { id: project.id, title: project.title, color: project.color }
        : null;
    }
    return task;
  }

  create(fields: Partial<TaskListItem> & { title: string }): Task {
    const task = fakeTask(`tsk_new${this.tasks.length + 1}`, fields.title, fields);
    this.tasks.push(task);
    return task;
  }
}
