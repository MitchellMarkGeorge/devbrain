import { z } from 'zod';
import type { EventId, NoteId, ProjectId, TaskId } from '../ids';
import type { ExternalRef } from './integrations';
import type {
  Archivable,
  Completeable,
  EventSummary,
  Model,
  NoteSummary,
  ProjectSummary,
  TaskSummary,
} from './shared';

export enum TaskPriority {
  // migrated to ints so sorting works
  // no priority: a synced task whose provider has none set (Linear's "No priority") or none
  // DevBrain can read (a provider with no priority field). Only sync sets it, never a guess at
  // one; the provider's own label, if any, is shown with it. It sorts below LOW.
  NONE = 0,
  LOW = 1, //  'low'
  MEDIUM = 2, // 'medium'
  HIGH = 3, // 'high'
}

/** The priorities a user sets on a task. NONE comes only from a provider, through sync. */
export type SettablePriority = Exclude<TaskPriority, TaskPriority.NONE>;

export const settablePrioritySchema = z.literal([
  TaskPriority.LOW,
  TaskPriority.MEDIUM,
  TaskPriority.HIGH,
]);

export enum TaskStatus {
  // migrated to ints so sorting works
  NOT_STARTED = 1, //'not_started'
  IN_PROGRESS = 2, // 'in_progress'
  COMPLETED = 3, // 'completed'
  // like COMPLETED it closes the task, but it never sets completedAt
  CANCELLED = 4,
}

export interface Task extends Model<TaskId>, Archivable, Completeable {
  // so it is not coupled to Drizzle
  title: string;
  description: string | null;
  priority: TaskPriority;
  status: TaskStatus;
  startDate: Date | null;
  dueDate: Date | null;
  parentTaskId: TaskId | null;
  projectId: ProjectId | null;
  linkedEventId: EventId | null;
  linkedNoteId: NoteId | null;
  pullRequestUrl: string | null;
  // set on every read: the link to the provider item it mirrors, or null for a local task
  external?: ExternalRef | null;
}

// What a row in a task's subtask list shows beside the task's own fields, from listSubtasks.
export interface SubtaskListItem extends Task {
  // always set on a listed task: null for a local one
  external: ExternalRef | null;
  // counts of the task's direct, unarchived subtasks, leaving out cancelled ones as project stats
  // do; null when none are left
  subtaskProgress: SubtaskProgress | null;
  project: ProjectSummary | null;
  // the event or note the task is linked to
  link: TaskLinkSummary | null;
}

// A row in the task list, from listTasks: a subtask also names its parent.
export interface TaskListItem extends SubtaskListItem {
  // the parent of a subtask; null for a top-level task
  parentTask: TaskSummary | null;
}

export interface SubtaskProgress {
  completed: number;
  total: number;
}

export type TaskLinkSummary = ({ type: 'event' } & EventSummary) | ({ type: 'note' } & NoteSummary);

/**
 * What deleting a task removed: the task and every task below it at any depth (`taskIds`, the task
 * asked for first), and the notes that were the task note of one of them, kept with their link
 * cleared (`unlinkedNoteIds`).
 */
export interface TaskDeleteResult {
  taskIds: TaskId[];
  unlinkedNoteIds: NoteId[];
}
