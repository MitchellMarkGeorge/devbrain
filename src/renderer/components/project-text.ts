import { ProjectStatus, type Project } from '@common/types';
import { dueText, type Format } from './lib/format';

/**
 * The date a project's card and row end with: "Done Jun 12" once completed, else its due date
 * ("Due Jul 1", "Due tomorrow"), or nothing.
 */
export function projectDateText(
  project: Pick<Project, 'status' | 'dueDate' | 'completedAt'>,
  format: Pick<Format, 'formatDue' | 'formatDate'>,
): string | undefined {
  if (project.status === ProjectStatus.COMPLETED && project.completedAt) {
    return `Done ${format.formatDate(project.completedAt)}`;
  }
  return project.dueDate ? dueText(project.dueDate, format) : undefined;
}
