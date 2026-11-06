import type { NoteId, ProjectId, TaskId } from '../ids';
import type { ExternalRef } from './integrations';
import type { Archivable, Completeable, Model } from './shared';

export interface Project extends Model<ProjectId>, Archivable, Completeable {
  title: string;
  description: string | null;
  startDate: Date | null;
  dueDate: Date | null;
  status: ProjectStatus;
  color: string | null;
  // set on every read: the link to the provider item it mirrors, or null for a local project
  external?: ExternalRef | null;
}

export enum ProjectStatus {
  NOT_STARTED = 1,
  ON_HOLD = 2,
  ACTIVE = 3,
  COMPLETED = 4,
}

export enum ProjectHealth {
  OFF_TRACK = 1,
  NOT_STARTED = 2,
  AT_RISK = 3,
  ON_TRACK = 4,
  COMPLETED = 5,
}

export interface ProjectStats {
  numOfNotStarted: number;
  numOfInProgress: number;
  numOfCompleted: number;
  numOfCancelled: number;
  numOfOverdue: number;
  // excludes cancelled tasks, so progress is numOfCompleted / totalTasks
  totalTasks: number;
}

/**
 * What deleting a project changed: the project is gone, and its tasks and notes, kept, lost it
 * (`unfiledTaskIds`, `unfiledNoteIds`).
 */
export interface ProjectDeleteResult {
  projectId: ProjectId;
  unfiledTaskIds: TaskId[];
  unfiledNoteIds: NoteId[];
}
