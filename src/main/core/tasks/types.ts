import { EventId, NoteId, ProjectId, TaskId } from '@common/ids';
import { Archivable, Completeable, Model } from '../shared/model';
import { tasks } from '@main/db/schema/tasks';
import { InferSelectModel } from 'drizzle-orm';

export enum TaskPriority {
  LOW = 'low',
  MEDIUM = 'medium',
  HIGH = 'high',
}

export enum TaskStatus {
  NOT_STARTED = 'not_started',
  IN_PROGRESS = 'in_progress',
  COMPLETED = 'completed',
}

export interface Task extends Model<TaskId>, Archivable, Completeable {
  // so it is not coupled to Drizzle
  title: string;
  description: string | null;
  priority: TaskPriority;
  status: TaskStatus;
  startDate: Date | null;
  dueDate: Date;
  parentTaskId: TaskId | null;
  projectId: ProjectId | null;
  linkedEventId: EventId | null;
  linkedNoteId: NoteId | null;
  completedAt: Date | null;
  pullRequestUrl: string | null;
}
export interface CreateTaskOptions {
  title: string;
  description?: string;
  // optional for quick capture, will be given defaults
  priority?: TaskPriority;
  status?: TaskStatus;

  dueDate: Date;
  startDate?: Date;
  projectId?: ProjectId;
  // either, not both
  linkedEventId?: EventId | null;
  linkedNoteId?: NoteId | null;
}

export interface CreateSubTaskOptions {
  title: string;
  description?: string;
  priority?: TaskPriority;
  status?: TaskStatus;
  dueDate?: Date;
  startDate?: Date;
}

export type TaskSort = 'priority' | 'dueDate' | 'status' | 'created';

export interface TaskFilter {
  status?: TaskStatus;
  // allowing null for some options to be able to test the absence of said links
  // for example, getting all tasks that are without a project
  projectId?: ProjectId | null;
  noteId?: NoteId | null;
  eventId?: EventId | null;
  priority?: TaskPriority;
  dueOn?: Date;
  dueBefore?: Date;
  dueAfter?: Date;

  excludeSubtasks?: boolean;
}

// links, sub/parent task relationships, time stamps, project membership  and status are updated seperatly and have thier own logic
export interface UpdateTaskOptions {
  title?: string;
  description?: string;
  priority?: TaskPriority;
  startDate?: Date;
  dueDate?: Date;
  pullRequestUrl?: string;
}

export interface UpdateTaskLinkOptions {
  // either, not both
  linkedEventId?: EventId | null;
  linkedNoteId?: NoteId | null;
}

export type TaskRow = InferSelectModel<typeof tasks>; // raw row shape
