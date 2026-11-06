import type { ProjectStatus } from '@common/types';

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

// export type ProjectSort = 'priority' | 'dueDate' | 'status' | 'createdAt' | 'updatedAt';

export interface ProjectFilterOptions {
  dueOn?: Date;
  dueBefore?: Date;
  dueAfter?: Date;
  status?: ProjectStatus;
  // external: synced from an integration; local: everything else, detached projects included
  origin?: 'local' | 'external';
  // health?: ProjectHealth;
}

export interface ProjectSortOptions {
  // should be able to sort by progress and by project health, both computed fields
  // sortBy: 'dueDate' |  'createdAt' | 'updatedAt' | 'progress' | 'health';
  sortBy: 'dueDate' | 'createdAt' | 'updatedAt' | 'status';
  direction?: 'asc' | 'desc';
}
