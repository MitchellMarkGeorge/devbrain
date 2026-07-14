import { ProjectId } from '@common/ids';
import { Archivable, Completeable, Model } from '../shared/model';

export interface Project extends Model<ProjectId>, Archivable, Completeable {
  title: string;
  description: string | null;
  startDate: Date | null;
  dueDate: Date;
  status: ProjectStatus;
  color: string | null;
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

export interface CreateProjectOptions {
  title: string;
  description?: string;
  startDate?: Date;
  dueDate: Date;
  color?: string;
  status?: ProjectStatus;
}

export interface UpdateProjectOptions {
  title?: string;
  description?: string;
  startDate?: Date;
  dueDate?: Date;
  color?: string;
  status?: ProjectStatus;
}

// export type ProjectSort = 'priority' | 'dueDate' | 'status' | 'created' | 'lastUpdated';

export interface ProjectFilterOptions {
  dueOn?: Date;
  dueBefore?: Date;
  dueAfter?: Date;
  status?: ProjectStatus;
  // health?: ProjectHealth;
}

export interface ProjectSortOptions {
  // should be able to sort by progress and by project health, both computed fields
  // sortBy: 'dueDate' |  'created' | 'lastUpdated' | 'progress' | 'health';
  sortBy: 'dueDate' | 'created' | 'lastUpdated' | 'status';
  direction?: 'asc' | 'desc';
}

export interface ProjectStats {
  numOfNotStarted: number;
  numOfInProgress: number;
  numOfCompleted: number;
  numOfOverdue: number;
  totalTasks: number;
}
