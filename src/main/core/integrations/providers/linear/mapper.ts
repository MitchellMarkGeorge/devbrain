import { ExternalProject, ExternalTask } from '../../types';
import { TaskStatus } from '../../../tasks/types';
import { ProjectStatus } from '../../../projects/types';
import {
  LinearIssue,
  LinearProject,
  PRIORITY,
  PROJECT_STATE_STATUS,
  STATE_TYPE_STATUS,
} from './schema';

// Maps validated Linear nodes to the normalised items, per the mapping tables in the design.

// `viewerId` is the account's user id; an issue assigned to anyone else maps with
// assignedToViewer false, which a lookup reads as "remove"
export function toExternalTask(issue: LinearIssue, viewerId: string): ExternalTask {
  const status = STATE_TYPE_STATUS[issue.state.type];
  return {
    externalId: issue.id,
    key: issue.identifier,
    url: issue.url,
    title: issue.title,
    description: issue.description || null,
    status,
    priority: PRIORITY[issue.priority],
    statusLabel: issue.state.name,
    priorityLabel: issue.priorityLabel,
    startDate: toDate(issue.startedAt),
    dueDate: toLocalMidnight(issue.dueDate),
    // a cancelled issue keeps completedAt null; the database checks the pair
    completedAt:
      status === TaskStatus.COMPLETED ? new Date(issue.completedAt ?? issue.updatedAt) : null,
    createdAt: new Date(issue.createdAt),
    updatedAt: new Date(issue.updatedAt),
    parentExternalId: issue.parent?.id ?? null,
    parentKey: issue.parent?.identifier ?? null,
    parentTitle: issue.parent?.title ?? null,
    projectExternalId: issue.project?.id ?? null,
    assignedToViewer: issue.assignee?.id === viewerId,
  };
}

export function toExternalProject(project: LinearProject): ExternalProject {
  const status = PROJECT_STATE_STATUS[project.state];
  return {
    externalId: project.id,
    url: project.url,
    title: project.name,
    description: project.description || null,
    status,
    statusLabel: project.state,
    startDate: toLocalMidnight(project.startDate),
    dueDate: toLocalMidnight(project.targetDate),
    color: project.color,
    // completed and canceled both map to COMPLETED, which needs a completedAt
    completedAt:
      status === ProjectStatus.COMPLETED
        ? new Date(project.completedAt ?? project.canceledAt ?? project.updatedAt)
        : null,
    createdAt: new Date(project.createdAt),
    updatedAt: new Date(project.updatedAt),
  };
}

function toDate(value: string | null): Date | null {
  return value === null ? null : new Date(value);
}

// date-only values are stored as local midnight, so the dueOn local-day filter matches them
export function toLocalMidnight(value: string | null): Date | null {
  if (value === null) {
    return null;
  }
  const [year, month, day] = value.split('-').map(Number);
  return new Date(year, month - 1, day);
}
