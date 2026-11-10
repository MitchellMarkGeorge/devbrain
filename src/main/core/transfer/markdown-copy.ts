import { ProjectStatus, TaskStatus } from '@common/types';
import { toDateString } from '../shared/dates';
import { type ExportedTask, STATUS_NAMES } from './task-format';

// Copy as Markdown (C3): a task, project or note as one Markdown document for the clipboard. Tasks
// come in as the export writers build them (toExportedTasks), so the fields read as an export
// writes them: dates as YYYY-MM-DD, subtasks nested under their parent.

const TASK_STATUS_LABELS: Record<string, string> = {
  [STATUS_NAMES[TaskStatus.NOT_STARTED]]: 'Not started',
  [STATUS_NAMES[TaskStatus.IN_PROGRESS]]: 'In progress',
  [STATUS_NAMES[TaskStatus.COMPLETED]]: 'Completed',
  [STATUS_NAMES[TaskStatus.CANCELLED]]: 'Cancelled',
};

const PRIORITY_LABELS: Record<string, string> = { low: 'Low', medium: 'Medium', high: 'High' };

const PROJECT_STATUS_LABELS: Record<ProjectStatus, string> = {
  [ProjectStatus.NOT_STARTED]: 'Not started',
  [ProjectStatus.ON_HOLD]: 'On hold',
  [ProjectStatus.ACTIVE]: 'Active',
  [ProjectStatus.COMPLETED]: 'Completed',
};

// the order a project's task groups are written in, as the tasks page groups by status
const STATUS_GROUP_ORDER = [
  TaskStatus.NOT_STARTED,
  TaskStatus.IN_PROGRESS,
  TaskStatus.COMPLETED,
  TaskStatus.CANCELLED,
].map((status) => STATUS_NAMES[status]);

// "- **Status:** In progress" lines, leaving out what has no value
function properties(entries: [label: string, value: string | null][]): string[] {
  return entries
    .filter((entry): entry is [string, string] => entry[1] !== null && entry[1] !== '')
    .map(([label, value]) => `- **${label}:** ${value}`);
}

// a title on one line, as a heading or a list item needs it
function oneLine(title: string): string {
  return title.replace(/\s+/g, ' ').trim();
}

// tasks as a GFM checklist, each subtask indented under its parent; a cancelled task is struck out
function checklist(tasks: ExportedTask[], depth = 0): string[] {
  return tasks.flatMap((task) => {
    const done = task.status === STATUS_NAMES[TaskStatus.COMPLETED];
    const cancelled = task.status === STATUS_NAMES[TaskStatus.CANCELLED];
    const title = oneLine(task.title) || 'Untitled';
    return [
      `${'  '.repeat(depth)}- [${done ? 'x' : ' '}] ${cancelled ? `~~${title}~~` : title}`,
      ...checklist(task.subtasks, depth + 1),
    ];
  });
}

function document(sections: string[][]): string {
  return `${sections
    .filter((section) => section.length > 0)
    .map((section) => section.join('\n'))
    .join('\n\n')}\n`;
}

/** A task: its title, its properties, its description, then its subtasks as a checklist. */
export function taskAsMarkdown(task: ExportedTask): string {
  return document([
    [`# ${oneLine(task.title) || 'Untitled'}`],
    properties([
      ['Status', TASK_STATUS_LABELS[task.status] ?? task.status],
      ['Priority', PRIORITY_LABELS[task.priority] ?? task.priority],
      ['Start', task.startDate],
      ['Due', task.dueDate],
      ['Project', task.project],
      ['Pull request', task.pullRequestUrl],
    ]),
    task.description?.trim() ? [task.description.trim()] : [],
    task.subtasks.length > 0 ? ['## Subtasks', '', ...checklist(task.subtasks)] : [],
  ]);
}

export interface ProjectMarkdownFields {
  title: string;
  description: string | null;
  status: ProjectStatus;
  startDate: Date | null;
  dueDate: Date | null;
}

/**
 * A project: its title, properties and description, then its tasks as checklists grouped by
 * status (Not started, In progress, Completed, Cancelled; empty groups left out). A subtask stays
 * under its parent whatever its own status.
 */
export function projectAsMarkdown(project: ProjectMarkdownFields, tasks: ExportedTask[]) {
  const groups = STATUS_GROUP_ORDER.map((status) => ({
    label: TASK_STATUS_LABELS[status],
    tasks: tasks.filter((task) => task.status === status),
  })).filter((group) => group.tasks.length > 0);
  return document([
    [`# ${oneLine(project.title) || 'Untitled'}`],
    properties([
      ['Status', PROJECT_STATUS_LABELS[project.status]],
      ['Start', project.startDate ? toDateString(project.startDate) : null],
      ['Due', project.dueDate ? toDateString(project.dueDate) : null],
    ]),
    project.description?.trim() ? [project.description.trim()] : [],
    ...groups.map((group) => [`## ${group.label}`, '', ...checklist(group.tasks)]),
  ]);
}

/** A note: its title as the heading, then its markdown as it is. */
export function noteAsMarkdown(title: string, content: string): string {
  return document([[`# ${oneLine(title) || 'Untitled'}`], content.trim() ? [content.trim()] : []]);
}
