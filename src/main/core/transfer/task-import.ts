import { safeExternalUrl } from '@common/safe-url';
import type { ProjectId } from '@common/ids';
import { fromDateString, isDateString } from '../shared/dates';
import {
  TaskPriority,
  TaskStatus,
  type CreateSubtaskTreeOptions,
  type CreateTaskTreeOptions,
} from '../tasks/types';
import { MAX_DESCRIPTION_LENGTH, MAX_TITLE_LENGTH } from './limits';
import type { TaskRecord } from './task-format';
import type { TaskImportIssue } from './types';

// Turns the rows of a task file into the trees TaskService.createTaskTrees creates, and the rows it
// leaves out into the import's summary. Pure: what it needs from the workspace comes in `context`.

export interface TaskImportContext {
  // for a top-level task without one; a subtask without one takes its parent's
  defaultDueDate: Date;
  defaultPriority: TaskPriority;
  // the active projects by matchKey(title)
  projectsByTitle: Map<string, ProjectId[]>;
  // ids in the file that are tasks already in the workspace
  existingTaskIds: Set<string>;
}

export interface TaskImportPlan {
  trees: CreateTaskTreeOptions[];
  skipped: TaskImportIssue[];
  errors: TaskImportIssue[];
  warnings: TaskImportIssue[];
}

// how titles are compared when matching projects: trimmed, ignoring case
export function matchKey(title: string): string {
  return title.normalize('NFC').trim().toLocaleLowerCase('en-US');
}

// a status or priority as a key: "In progress", "in-progress" and "IN_PROGRESS" are "in_progress"
function enumKey(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, '_');
}

const STATUSES: Record<string, TaskStatus> = {
  not_started: TaskStatus.NOT_STARTED,
  todo: TaskStatus.NOT_STARTED,
  in_progress: TaskStatus.IN_PROGRESS,
  completed: TaskStatus.COMPLETED,
  done: TaskStatus.COMPLETED,
  cancelled: TaskStatus.CANCELLED,
  canceled: TaskStatus.CANCELLED,
};

const STATUS_LIST = 'not_started, in_progress, completed or cancelled';

const PRIORITIES: Record<string, TaskPriority> = {
  low: TaskPriority.LOW,
  medium: TaskPriority.MEDIUM,
  high: TaskPriority.HIGH,
};

// a field's value, or why the row can't be imported
type Checked<T> = { value: T } | { error: string };

function lookup<T>(table: Record<string, T>, raw: string, what: string, names: string): Checked<T> {
  const key = enumKey(raw);
  if (!Object.hasOwn(table, key)) return { error: `Unknown ${what} "${raw}"; use ${names}` };
  return { value: table[key] };
}

function dateField(raw: string | null, column: string): Checked<Date | undefined> {
  if (raw === null) return { value: undefined };
  const value = raw.trim();
  if (!isDateString(value)) {
    return { error: `${column} "${raw}" is not a date written as YYYY-MM-DD` };
  }
  return { value: fromDateString(value) };
}

function isLocal(record: TaskRecord): boolean {
  const source = record.fields.source?.trim().toLowerCase();
  return !source || source === 'local';
}

/**
 * The plan for importing `roots`. Each row is checked in turn:
 *
 * 1. A row that could not be read (`error`) is an error.
 * 2. A synced task (`source` other than local) is skipped: its integration brings it back.
 * 3. A task whose id is already in the workspace is skipped, so importing an export twice adds
 *    nothing.
 * 4. A missing title, an unknown status or priority, a date that is not YYYY-MM-DD, a pull request
 *    link that is not http(s), or a title or description over its limit is an error.
 *
 * A missing status is not started, a missing priority the default priority, and a missing due
 * date the default due date (a subtask's, its parent's). A project is matched by title; when no
 * project, or more than one, has that title, the task is imported without one and a warning says
 * so. A subtask takes its top-level task's project, as every local subtask does. The subtasks of a
 * row that is not imported are skipped.
 */
export function planTaskImport(roots: TaskRecord[], context: TaskImportContext): TaskImportPlan {
  const plan: TaskImportPlan = { trees: [], skipped: [], errors: [], warnings: [] };
  const issue = (record: TaskRecord, message: string): TaskImportIssue => ({
    row: record.row,
    title: record.fields.title?.trim() || null,
    message,
  });

  const skipSubtasks = (parent: TaskRecord) => {
    for (const subtask of parent.subtasks) {
      plan.skipped.push(
        issue(subtask, `Not imported because its parent task (row ${parent.row}) wasn't`),
      );
      skipSubtasks(subtask);
    }
  };

  // the row's options, or why it can't be imported
  const fields = (
    record: TaskRecord,
    isRoot: boolean,
  ): Checked<CreateSubtaskTreeOptions & { projectId?: ProjectId }> => {
    const { fields } = record;
    const title = fields.title?.trim();
    if (!title) return { error: 'Title is missing' };
    if (title.length > MAX_TITLE_LENGTH) {
      return { error: `Title is longer than ${MAX_TITLE_LENGTH} characters` };
    }
    if (fields.description !== null && fields.description.length > MAX_DESCRIPTION_LENGTH) {
      return { error: `Description is longer than ${MAX_DESCRIPTION_LENGTH} characters` };
    }
    const status =
      fields.status === null
        ? { value: undefined }
        : lookup(STATUSES, fields.status, 'status', STATUS_LIST);
    if ('error' in status) return status;
    const priority =
      fields.priority === null
        ? { value: context.defaultPriority }
        : lookup(PRIORITIES, fields.priority, 'priority', 'low, medium or high');
    if ('error' in priority) return priority;
    const startDate = dateField(fields.startDate, 'Start date');
    if ('error' in startDate) return startDate;
    const dueDate = dateField(fields.dueDate, 'Due date');
    if ('error' in dueDate) return dueDate;
    let pullRequestUrl: string | undefined;
    if (fields.pullRequestUrl !== null) {
      pullRequestUrl = safeExternalUrl(fields.pullRequestUrl.trim()) ?? undefined;
      if (pullRequestUrl === undefined) {
        return { error: 'Pull request link must be an http or https URL' };
      }
    }

    let projectId: ProjectId | undefined;
    if (isRoot && fields.project !== null) {
      const name = fields.project.trim();
      const matches = context.projectsByTitle.get(matchKey(name)) ?? [];
      if (matches.length === 1) {
        [projectId] = matches;
      } else {
        const why = matches.length === 0 ? 'No project is' : `${matches.length} projects are`;
        plan.warnings.push(issue(record, `${why} named "${name}"; imported without a project`));
      }
    }

    return {
      value: {
        title,
        description: fields.description ?? undefined,
        status: status.value,
        priority: priority.value,
        startDate: startDate.value,
        dueDate: dueDate.value ?? (isRoot ? context.defaultDueDate : undefined),
        pullRequestUrl,
        projectId,
      },
    };
  };

  // the options for the row and its subtree, or null when it is not imported
  const visit = (record: TaskRecord, isRoot: boolean) => {
    if (record.error !== null) {
      plan.errors.push(issue(record, record.error));
      skipSubtasks(record);
      return null;
    }
    if (!isLocal(record)) {
      const key = record.fields.externalKey?.trim();
      const source = record.fields.source!.trim();
      plan.skipped.push(
        issue(
          record,
          `Synced from ${source}${key ? ` (${key})` : ''}; its integration brings it back, so it isn't imported`,
        ),
      );
      skipSubtasks(record);
      return null;
    }
    if (record.id !== null && context.existingTaskIds.has(record.id)) {
      plan.skipped.push(issue(record, 'Already in this workspace'));
      skipSubtasks(record);
      return null;
    }
    const options = fields(record, isRoot);
    if ('error' in options) {
      plan.errors.push(issue(record, options.error));
      skipSubtasks(record);
      return null;
    }
    const subtasks: CreateSubtaskTreeOptions[] = [];
    for (const subtask of record.subtasks) {
      const tree = visit(subtask, false);
      if (tree !== null) subtasks.push(tree);
    }
    return { ...options.value, subtasks };
  };

  for (const root of roots) {
    const tree = visit(root, true);
    // a top-level task always has a due date: its own or the default
    if (tree !== null) plan.trees.push({ ...tree, dueDate: tree.dueDate! });
  }
  for (const list of [plan.skipped, plan.errors, plan.warnings]) list.sort((a, b) => a.row - b.row);
  return plan;
}
