import type { TaskId } from '@common/ids';
import { toDateString } from '../shared/dates';
import { TaskPriority, TaskStatus, type TaskListItem } from '../tasks/types';
import { formatCsv, parseCsv } from './csv';
import { MAX_TASK_DEPTH, MAX_TASK_ROWS } from './limits';
import type { TaskImportIssue } from './types';
import { ImportFileError } from '../shared/errors';

// The CSV and JSON task formats (docs/import-export.md). Both read into the same TaskRecord tree,
// with values still as the file has them; task-import.ts checks them.

export const TASKS_JSON_FORMAT = 'devbrain.tasks';
export const TASKS_JSON_VERSION = 1;

export const STATUS_NAMES: Record<TaskStatus, string> = {
  [TaskStatus.NOT_STARTED]: 'not_started',
  [TaskStatus.IN_PROGRESS]: 'in_progress',
  [TaskStatus.COMPLETED]: 'completed',
  [TaskStatus.CANCELLED]: 'cancelled',
};

export const PRIORITY_NAMES: Record<TaskPriority, string> = {
  [TaskPriority.LOW]: 'low',
  [TaskPriority.MEDIUM]: 'medium',
  [TaskPriority.HIGH]: 'high',
};

// a task's fields as the file has them; null when absent or empty
export interface TaskRecordFields {
  title: string | null;
  description: string | null;
  status: string | null;
  priority: string | null;
  startDate: string | null;
  dueDate: string | null;
  project: string | null;
  pullRequestUrl: string | null;
}

export interface TaskRecord {
  row: number;
  // the task's id in the file: what a CSV row's parent_id names, and how a task already in the
  // workspace is recognised. Never used as the new task's id
  id: string | null;
  fields: TaskRecordFields;
  subtasks: TaskRecord[];
  // why the row can't be read, such as a field of the wrong type; it is not imported
  error: string | null;
}

export interface ParsedTaskFile {
  roots: TaskRecord[];
  warnings: TaskImportIssue[];
}

// --- Export ---------------------------------------------------------------

// a task as an export writes it; JSON nests subtasks, CSV writes them as rows with a parent_id
export interface ExportedTask {
  id: TaskId;
  title: string;
  description: string | null;
  status: string;
  priority: string;
  startDate: string | null;
  dueDate: string | null;
  project: string | null;
  pullRequestUrl: string | null;
  completedAt: string | null;
  createdAt: string;
  subtasks: ExportedTask[];
}

/**
 * Tasks as the trees an export writes, in the order given, each subtask under its parent. A task
 * whose parent is not among them (archived) is written as a top-level one.
 */
export function toExportedTasks(tasks: TaskListItem[]): ExportedTask[] {
  const exported = new Map<TaskId, ExportedTask>();
  for (const task of tasks) {
    exported.set(task.id, {
      id: task.id,
      title: task.title,
      description: task.description,
      status: STATUS_NAMES[task.status],
      priority: PRIORITY_NAMES[task.priority],
      startDate: task.startDate ? toDateString(task.startDate) : null,
      dueDate: task.dueDate ? toDateString(task.dueDate) : null,
      project: task.project?.title ?? null,
      pullRequestUrl: task.pullRequestUrl,
      completedAt: task.completedAt?.toISOString() ?? null,
      createdAt: task.createdAt.toISOString(),
      subtasks: [],
    });
  }
  const roots: ExportedTask[] = [];
  for (const task of tasks) {
    const parent = task.parentTaskId ? exported.get(task.parentTaskId) : undefined;
    (parent?.subtasks ?? roots).push(exported.get(task.id)!);
  }
  return roots;
}

export function formatTasksJson(roots: ExportedTask[], exportedAt: Date): string {
  const document = {
    format: TASKS_JSON_FORMAT,
    version: TASKS_JSON_VERSION,
    exportedAt: exportedAt.toISOString(),
    tasks: roots,
  };
  return `${JSON.stringify(document, null, 2)}\n`;
}

// the CSV columns, in the order an export writes them
export const CSV_COLUMNS = [
  'id',
  'parent_id',
  'title',
  'description',
  'status',
  'priority',
  'start_date',
  'due_date',
  'project',
  'pull_request_url',
  'completed_at',
  'created_at',
] as const;

// one row per task, each after its parent, with a byte order mark so spreadsheets read UTF-8
export function formatTasksCsv(roots: ExportedTask[]): string {
  const rows: string[][] = [[...CSV_COLUMNS]];
  const write = (task: ExportedTask, parentId: TaskId | null) => {
    rows.push([
      task.id,
      parentId ?? '',
      task.title,
      task.description ?? '',
      task.status,
      task.priority,
      task.startDate ?? '',
      task.dueDate ?? '',
      task.project ?? '',
      task.pullRequestUrl ?? '',
      task.completedAt ?? '',
      task.createdAt,
    ]);
    for (const subtask of task.subtasks) write(subtask, task.id);
  };
  for (const root of roots) write(root, null);
  return `\ufeff${formatCsv(rows)}\r\n`;
}

// --- Import ---------------------------------------------------------------

// a header as a key: "Due Date", "due_date" and "dueDate" are all "duedate"
function headerKey(header: string): string {
  return header.toLowerCase().replace(/[^a-z0-9]/g, '');
}

const CSV_FIELDS: Record<string, keyof TaskRecordFields | 'id' | 'parentId'> = {
  id: 'id',
  parentid: 'parentId',
  title: 'title',
  description: 'description',
  status: 'status',
  priority: 'priority',
  startdate: 'startDate',
  duedate: 'dueDate',
  project: 'project',
  pullrequesturl: 'pullRequestUrl',
};

function emptyFields(): TaskRecordFields {
  return {
    title: null,
    description: null,
    status: null,
    priority: null,
    startDate: null,
    dueDate: null,
    project: null,
    pullRequestUrl: null,
  };
}

function tooManyRows(fileName: string): ImportFileError {
  return new ImportFileError(
    'too_large',
    fileName,
    `${fileName} has more than ${MAX_TASK_ROWS.toLocaleString('en-US')} tasks`,
  );
}

/**
 * The tasks of a CSV file. The first record is the header: columns are matched by name, ignoring
 * case, spaces and underscores; `title` is required and unknown columns are ignored. A row's
 * `parent_id` names another row's `id` to make it that row's subtask. Blank rows are skipped.
 * Throws ImportFileError (malformed) for a file without a title column or with an unclosed quote,
 * and (too_large) for too many rows.
 */
export function parseTasksCsv(text: string, fileName: string): ParsedTaskFile {
  const { records, problem } = parseCsv(text);
  if (problem !== null) throw new ImportFileError('malformed', fileName, `${fileName}: ${problem}`);
  const [header = [], ...rows] = records;
  const columns = header.map((name) => CSV_FIELDS[headerKey(name)] ?? null);
  if (!columns.includes('title')) {
    throw new ImportFileError('malformed', fileName, `${fileName} has no "title" column`);
  }
  if (rows.length > MAX_TASK_ROWS) throw tooManyRows(fileName);

  const flat: { record: TaskRecord; parentId: string | null }[] = [];
  rows.forEach((cells, index) => {
    if (cells.every((cell) => cell.trim() === '')) return;
    const record: TaskRecord = {
      // the header is row 1
      row: index + 2,
      id: null,
      fields: emptyFields(),
      subtasks: [],
      error: null,
    };
    let parentId: string | null = null;
    columns.forEach((column, i) => {
      const value = cells[i]?.trim() ? cells[i] : null;
      if (column === null || value === null) return;
      if (column === 'id') record.id = value.trim();
      else if (column === 'parentId') parentId = value.trim();
      else record.fields[column] = value;
    });
    flat.push({ record, parentId });
  });
  return buildTree(flat);
}

// Links each row to its parent_id's row. A parent_id that names no row is dropped with a warning,
// leaving a top-level task; a repeated id, a parent chain that loops, and nesting deeper than
// MAX_TASK_DEPTH are errors on the rows concerned. Every row ends up in the tree once.
function buildTree(flat: { record: TaskRecord; parentId: string | null }[]): ParsedTaskFile {
  const warnings: TaskImportIssue[] = [];
  const byId = new Map<string, TaskRecord>();
  for (const { record } of flat) {
    if (record.id === null) continue;
    const first = byId.get(record.id);
    if (first) record.error = `Its id ${record.id} is also on row ${first.row}`;
    else byId.set(record.id, record);
  }

  const children = new Map<TaskRecord, TaskRecord[]>();
  const roots: TaskRecord[] = [];
  for (const { record, parentId } of flat) {
    const parent = parentId === null ? undefined : byId.get(parentId);
    if (parentId !== null && parent === undefined) {
      warnings.push({
        row: record.row,
        title: record.fields.title,
        message: `No row has the id ${parentId} its parent_id names; imported as a top-level task`,
      });
    }
    if (parent === undefined) {
      roots.push(record);
    } else {
      const siblings = children.get(parent) ?? [];
      siblings.push(record);
      children.set(parent, siblings);
    }
  }

  // breadth first from the roots, so no recursion however long a chain is
  const reached = new Set<TaskRecord>();
  const tooDeep: TaskRecord[] = [];
  let level = roots;
  for (let depth = 0; level.length > 0; depth++) {
    const next: TaskRecord[] = [];
    for (const record of level) {
      reached.add(record);
      const below = children.get(record) ?? [];
      if (depth >= MAX_TASK_DEPTH) {
        tooDeep.push(...below);
      } else {
        record.subtasks = below;
      }
      next.push(...below);
    }
    level = next;
  }
  for (const record of tooDeep) {
    record.error ??= `It is nested more than ${MAX_TASK_DEPTH} levels deep`;
    record.subtasks = [];
    roots.push(record);
  }
  // rows no root reaches: their parent_id chain loops
  for (const { record } of flat) {
    if (reached.has(record)) continue;
    record.error ??= 'Its parent_id chain loops back on itself';
    roots.push(record);
  }
  roots.sort((a, b) => a.row - b.row);
  return { roots, warnings };
}

type JsonObject = Record<string, unknown>;

function isObject(value: unknown): value is JsonObject {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * The tasks of a JSON file: a document `{ format, version, tasks: [...] }` as an export writes, or
 * a bare array of tasks. Each task is an object whose `subtasks`, if any, is an array of tasks.
 * Unknown keys are ignored. Throws ImportFileError (malformed) for text that does not parse, a
 * document of another format or a newer version, or no task list; (too_large) for too many tasks.
 */
export function parseTasksJson(text: string, fileName: string): ParsedTaskFile {
  let document: unknown;
  try {
    document = JSON.parse(text);
  } catch {
    throw new ImportFileError('malformed', fileName, `${fileName} is not valid JSON`);
  }
  let list: unknown;
  if (Array.isArray(document)) {
    list = document;
  } else if (isObject(document)) {
    const { format, version } = document;
    if (format !== undefined && format !== TASKS_JSON_FORMAT) {
      throw new ImportFileError('malformed', fileName, `${fileName} is not a DevBrain task file`);
    }
    if (typeof version === 'number' && version > TASKS_JSON_VERSION) {
      throw new ImportFileError(
        'malformed',
        fileName,
        `${fileName} was made by a newer version of DevBrain`,
      );
    }
    list = Object.hasOwn(document, 'tasks') ? document.tasks : undefined;
  }
  if (!Array.isArray(list)) {
    throw new ImportFileError('malformed', fileName, `${fileName} has no list of tasks`);
  }

  let count = 0;
  const read = (value: unknown, depth: number): TaskRecord => {
    count += 1;
    if (count > MAX_TASK_ROWS) throw tooManyRows(fileName);
    const record: TaskRecord = {
      row: count,
      id: null,
      fields: emptyFields(),
      subtasks: [],
      error: null,
    };
    if (!isObject(value)) {
      record.error = 'It is not an object';
      return record;
    }
    const problems: string[] = [];
    const text = (key: string): string | null => {
      const field = Object.hasOwn(value, key) ? value[key] : undefined;
      if (field === undefined || field === null) return null;
      if (typeof field === 'string') return field.trim() === '' ? null : field;
      if (typeof field === 'number' || typeof field === 'boolean') return String(field);
      problems.push(`"${key}" must be text`);
      return null;
    };
    record.id = text('id')?.trim() ?? null;
    record.fields = {
      title: text('title'),
      description: text('description'),
      status: text('status'),
      priority: text('priority'),
      startDate: text('startDate'),
      dueDate: text('dueDate'),
      project: text('project'),
      pullRequestUrl: text('pullRequestUrl'),
    };
    const subtasks = Object.hasOwn(value, 'subtasks') ? value.subtasks : undefined;
    if (subtasks !== undefined && subtasks !== null && !Array.isArray(subtasks)) {
      problems.push('"subtasks" must be a list');
    }
    if (problems.length > 0) record.error = `${problems.join('; ')}`;
    if (Array.isArray(subtasks) && subtasks.length > 0) {
      if (depth >= MAX_TASK_DEPTH) {
        record.error ??= `Its subtasks are nested more than ${MAX_TASK_DEPTH} levels deep`;
      } else {
        record.subtasks = subtasks.map((subtask) => read(subtask, depth + 1));
      }
    }
    return record;
  };
  return { roots: list.map((value) => read(value, 0)), warnings: [] };
}
