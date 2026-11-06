import type { EventId, NoteId, ProjectId } from '@common/ids';
import type { TaskPriority, TaskStatus } from '@common/types';
import { tasks } from '@main/db/schema/tasks';
import { InferSelectModel } from 'drizzle-orm';

export interface CreateTaskOptions {
  title: string;
  description?: string;
  // optional for quick capture, will be given defaults
  priority?: TaskPriority;
  status?: TaskStatus;

  // left out or null: no due date
  dueDate?: Date | null;
  startDate?: Date;
  projectId?: ProjectId;
  // either, not both
  linkedEventId?: EventId | null;
  linkedNoteId?: NoteId | null;
  pullRequestUrl?: string;
}

export interface CreateSubTaskOptions {
  title: string;
  description?: string;
  priority?: TaskPriority;
  status?: TaskStatus;
  // left out, the parent's; null, none
  dueDate?: Date | null;
  startDate?: Date;
  pullRequestUrl?: string;
}

// A task and its subtasks, at any depth, for createTaskTrees. Each subtask takes its root's project
// and links, and its parent's due date when it has none, as createSubtask does.
export interface CreateTaskTreeOptions extends CreateTaskOptions {
  subtasks?: CreateSubtaskTreeOptions[];
}

export interface CreateSubtaskTreeOptions extends CreateSubTaskOptions {
  subtasks?: CreateSubtaskTreeOptions[];
}

// export type TaskSort = 'priority' | 'dueDate' | 'status' | 'createdAt' | 'updatedAt';

export interface TaskFilterOptions {
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
  // backs the showCompletedTasks setting: hides completed and cancelled tasks together
  excludeClosed?: boolean;
  // external: synced from an integration; local: everything else, detached tasks included
  origin?: 'local' | 'external';
}

export interface TaskSortOptions {
  sortBy: 'priority' | 'dueDate' | 'status' | 'createdAt' | 'updatedAt';
  direction?: 'asc' | 'desc';
}

// links, sub/parent task relationships, time stamps, project membership  and status are updated seperatly and have thier own logic
// A field left out is kept; null clears one the model allows to be empty.
export interface UpdateTaskOptions {
  title?: string;
  description?: string | null;
  priority?: TaskPriority;
  startDate?: Date | null;
  dueDate?: Date | null;
  pullRequestUrl?: string | null;
}

// What updateTasks sets on every task it is given: the fields the selection bar edits. A field left
// out is kept; a null due date or project clears it. Status sets completedAt as updateStatus does.
export interface BulkTaskPatch {
  status?: TaskStatus;
  priority?: TaskPriority;
  dueDate?: Date | null;
  projectId?: ProjectId | null;
}

export interface UpdateTaskLinkOptions {
  // either, not both
  linkedEventId?: EventId | null;
  linkedNoteId?: NoteId | null;
}

export type TaskRow = InferSelectModel<typeof tasks>; // raw row shape
