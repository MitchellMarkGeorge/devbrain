import type { NoteId, ProjectId, TaskId } from '@common/ids';
import {
  ProjectStatus,
  TaskPriority,
  TaskStatus,
  type NoteListItem,
  type Project,
  type Task,
  type TaskListItem,
} from '@common/types';

// The tasks a fake main's workspace holds, answering the tasks routes the pages call as core
// does where the pages can tell (filters, the one-task routes, favorites), and simply elsewhere
// (one page, no sort beyond the order given).

const EPOCH = new Date(2026, 5, 22, 9);

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
  priority?: TaskPriority;
  projectId?: ProjectId | null;
  excludeClosed?: boolean;
  excludeSubtasks?: boolean;
  noDueDate?: boolean;
  noteId?: NoteId | null;
};

const CLOSED = [TaskStatus.COMPLETED, TaskStatus.CANCELLED];

export class FakeTasks {
  constructor(
    public tasks: TaskListItem[] = [],
    public projects: Project[] = [],
    public notes: NoteListItem[] = [],
  ) {}

  /** each note's markdown, by id */
  readonly contents = new Map<string, string>();

  find(id: unknown): TaskListItem | undefined {
    return this.tasks.find((task) => task.id === id && task.archivedAt === null);
  }

  list(filter: Filter = {}): TaskListItem[] {
    return this.tasks.filter(
      (task) =>
        task.archivedAt === null &&
        (filter.status === undefined || task.status === filter.status) &&
        (filter.priority === undefined || task.priority === filter.priority) &&
        (filter.projectId === undefined || task.projectId === filter.projectId) &&
        (!filter.excludeClosed || !CLOSED.includes(task.status)) &&
        (!filter.excludeSubtasks || task.parentTaskId === null) &&
        (!filter.noDueDate || task.dueDate === null) &&
        (filter.noteId === undefined || task.linkedNoteId === filter.noteId),
    );
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
