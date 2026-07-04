import { ProjectId } from '@common/ids';
import { Archivable, Completeable, Model } from '../shared/model';

export interface Project extends Model<ProjectId>, Archivable, Completeable {
  title: string;
  description: string | null;
  startDate: Date | null;
  dueDate: Date;
  color: string | null;
}

export interface CreateProjectOptions {
  title: string;
  description?: string;
  startDate?: Date;
  dueDate: Date;
  color?: string;
}

export type ProjectSort = 'priority' | 'dueDate' | 'status' | 'created' | 'lastUpdated';

// export interface TaskFilter {
//   status?: TaskStatus;
//   // allowing null for some options to be able to test the absence of said links
//   // for example, getting all tasks that are without a project
//   projectId?: ProjectId | null;
//   noteId?: NoteId | null;
//   eventId?: EventId | null;
//   priority?: TaskPriority;
//   dueOn?: Date;
//   dueBefore?: Date;
//   dueAfter?: Date;

//   excludeSubtasks?: boolean;
// }
