import type { ProjectId } from '@common/ids';
import { TaskPriority, TaskStatus, type Project } from '@common/types';
import { PRIORITY_LABELS, TASK_STATUS_LABELS, type IconSource } from '../../components';
import type { CreateTaskDefaults } from './CreateTaskDialog';
import {
  dueFilter,
  PRIORITY_OF,
  STATUS_OF,
  type ResolvedTasksSearch,
  type TaskFilter,
} from './search';
import { DUE_FILTER_LABELS } from './TasksToolbar';

// The group view's groups (docs/renderer/implementation-plan.md, "How the infinite lists work" ›
// The group view): a fixed set for status, priority and due date, the workspace's projects (and
// "No project") for project. Each has the filter its own `tasks.list` adds to the page's.

/** What a group's heading draws, besides its counts. */
export interface GroupLook {
  icon?: 'status' | 'priority' | 'project' | 'due' | 'none';
  status?: TaskStatus;
  priority?: TaskPriority;
  color?: string | null;
  dueIcon?: IconSource;
}

export interface TaskGroupDef {
  /** unique in the view: `status:2`, `project:prj_…`, `due:today` */
  id: string;
  label: string;
  subtitle?: string;
  look: GroupLook;
  /** what the group's `tasks.list` adds to the page's filter */
  filter: TaskFilter;
  /** what "Add task" in its heading fills in */
  defaults: CreateTaskDefaults;
  /** a project group's project, for its done/total */
  projectId?: ProjectId;
}

const STATUSES = [
  TaskStatus.NOT_STARTED,
  TaskStatus.IN_PROGRESS,
  TaskStatus.COMPLETED,
  TaskStatus.CANCELLED,
];
const PRIORITIES = [TaskPriority.HIGH, TaskPriority.MEDIUM, TaskPriority.LOW];

/** The statuses the page's status filter lets through, in order. */
export function statusesFor(resolved: ResolvedTasksSearch): TaskStatus[] {
  switch (resolved.status) {
    case 'open':
      return [TaskStatus.NOT_STARTED, TaskStatus.IN_PROGRESS];
    case 'all':
      return [TaskStatus.NOT_STARTED, TaskStatus.IN_PROGRESS, TaskStatus.COMPLETED];
    default:
      return [STATUS_OF[resolved.status]];
  }
}

const DUE_BUCKETS = [
  { key: 'overdue', label: 'Overdue' },
  { key: 'today', label: 'Today' },
  { key: 'this_week_after_today', label: 'This week' },
  { key: 'later', label: 'Later' },
  { key: 'none', label: 'No due date' },
] as const;

/** The groups for the page's grouping and filters, in order. */
export function groupDefs(
  resolved: ResolvedTasksSearch,
  today: Date,
  projects: readonly Project[],
): TaskGroupDef[] {
  switch (resolved.groupBy) {
    case 'status':
      return statusesFor(resolved)
        .filter((status) => STATUSES.includes(status))
        .map((status) => ({
          id: `status:${status}`,
          label: TASK_STATUS_LABELS[status],
          look: { icon: 'status', status },
          filter: { status, excludeClosed: undefined },
          defaults: { status },
        }));
    case 'priority':
      return PRIORITIES.filter(
        (priority) => !resolved.priority || PRIORITY_OF[resolved.priority] === priority,
      ).map((priority) => ({
        id: `priority:${priority}`,
        label: PRIORITY_LABELS[priority],
        look: { icon: 'priority', priority },
        filter: { priority },
        defaults: { priority },
      }));
    case 'due': {
      if (resolved.due) {
        return [
          {
            id: `due:${resolved.due}`,
            label: DUE_FILTER_LABELS[resolved.due],
            look: { icon: 'due' },
            filter: {},
            defaults: {},
          },
        ];
      }
      return DUE_BUCKETS.map(({ key, label }) => ({
        id: `due:${key}`,
        label,
        look: { icon: 'due' },
        filter: dueFilter(key, today),
        defaults: key === 'today' ? { dueDate: today } : key === 'none' ? { dueDate: null } : {},
      }));
    }
    case 'project': {
      const none: TaskGroupDef = {
        id: 'project:none',
        label: 'No project',
        look: { icon: 'none' },
        filter: { projectId: null },
        defaults: { projectId: null },
      };
      if (resolved.project === 'none') return [none];
      const shown = resolved.project
        ? projects.filter((project) => project.id === resolved.project)
        : projects;
      return [
        ...shown.map(
          (project): TaskGroupDef => ({
            id: `project:${project.id}`,
            label: project.title,
            look: { icon: 'project', color: project.color },
            filter: { projectId: project.id },
            defaults: { projectId: project.id },
            projectId: project.id,
          }),
        ),
        ...(resolved.project ? [] : [none]),
      ];
    }
  }
}
