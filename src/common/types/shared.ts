import type { EntityType, EventId, Id, NoteId, ProjectId, TaskId } from '../ids';
import type { TaskStatus } from './tasks';

// The fields every entity read model has
export interface Model<T extends Id<EntityType>> {
  id: T;
  updatedAt: Date;
  createdAt: Date;
  favoritedAt: Date | null;
  viewedAt: Date | null;
}

export interface Archivable {
  archivedAt: Date | null;
}

export interface Completeable {
  completedAt: Date | null;
}

// A page of a list. Core's shared/pagination reads and writes the cursors.
export interface Page<T> {
  items: T[];
  /** pass as `cursor` to get the next page, null when there are no more items */
  nextCursor: string | null;
}

// The few fields a list row shows of another entity it points at, as a pill: a task's or note's
// project, a task's parent, and what a task or note is linked to. Core's shared/summaries loads
// them; archived rows are left out, as every list leaves them out.

export interface ProjectSummary {
  id: ProjectId;
  title: string;
  color: string | null;
}

export interface EventSummary {
  id: EventId;
  title: string;
  startAt: Date;
  // the event's own colour, or else its calendar's
  color: string | null;
}

export interface NoteSummary {
  id: NoteId;
  title: string;
}

export interface TaskSummary {
  id: TaskId;
  title: string;
  status: TaskStatus;
}
