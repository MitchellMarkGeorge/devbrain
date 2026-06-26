import { Archivable, Completeable, Model } from './model';
import { EventId, NoteId, ProjectId, TaskId } from '@common/ids';

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

// decoupled from ORM/query builder types
// this is the type that will be used by services and everything else
export interface Task extends Model<TaskId>, Archivable, Completeable {
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
}
