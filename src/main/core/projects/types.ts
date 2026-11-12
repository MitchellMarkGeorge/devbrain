import type { ProjectStatus } from '@common/types';

export interface CreateProjectOptions {
  title: string;
  description?: string;
  startDate?: Date;
  // left out or null: no due date
  dueDate?: Date | null;
  color?: string;
  status?: ProjectStatus;
  // the project's first tasks, created with it in one transaction, in this order
  tasks?: { title: string }[];
}

// A field left out is kept; null clears one the model allows to be empty.
export interface UpdateProjectOptions {
  title?: string;
  description?: string | null;
  startDate?: Date | null;
  dueDate?: Date | null;
  color?: string | null;
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
