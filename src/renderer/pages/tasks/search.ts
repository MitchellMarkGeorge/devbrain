import { z } from 'zod';
import { DateTime } from 'luxon';
import { isId, type NoteId, type ProjectId, type TaskId } from '@common/ids';
import { TaskPriority, TaskStatus, type AppSettings } from '@common/types';
import type { ipc } from '../../ipc';

// The tasks page's search params (docs/renderer/implementation-plan.md, "Search params"): snake
// case names and values, each `.optional().catch(undefined)`, so a bad value drops that one field
// back to its default rather than failing the page. A missing param means "the setting's default",
// read at render (`resolveTasksSearch`), so no default is ever written into the URL.

const optional = <T extends z.ZodType>(schema: T) => schema.optional().catch(undefined);

const taskId = z.custom<TaskId>((value) => isId('task', value), 'Not a task id');
const projectId = z.custom<ProjectId>((value) => isId('project', value), 'Not a project id');

export const TASK_VIEWS = ['list', 'group', 'board'] as const;
export const GROUP_BYS = ['project', 'status', 'priority', 'due'] as const;
export const SORTS = ['priority', 'due_date', 'status', 'created_at', 'updated_at'] as const;
export const STATUS_FILTERS = [
  'open',
  'all',
  'not_started',
  'in_progress',
  'completed',
  'cancelled',
] as const;
export const PRIORITY_FILTERS = ['high', 'medium', 'low'] as const;
export const DUE_FILTERS = ['overdue', 'today', 'week', 'none'] as const;
export const SOURCE_FILTERS = ['local', 'external'] as const;

export const tasksSearchSchema = z.object({
  view: optional(z.enum(TASK_VIEWS)),
  /** the group view's grouping; project by default */
  group_by: optional(z.enum(GROUP_BYS)),
  sort: optional(z.enum(SORTS)),
  dir: optional(z.enum(['asc', 'desc'])),
  /** `open` hides completed and cancelled tasks; the default follows `showCompletedTasks` */
  status: optional(z.enum(STATUS_FILTERS)),
  priority: optional(z.enum(PRIORITY_FILTERS)),
  /** a project's tasks, or `none` for the tasks in no project */
  project: optional(z.union([projectId, z.literal('none')])),
  due: optional(z.enum(DUE_FILTERS)),
  /** core's `origin`: synced from an integration, or not */
  source: optional(z.enum(SOURCE_FILTERS)),
  /** the task in the board's sheet */
  open: optional(taskId),
});

export type TasksSearch = z.infer<typeof tasksSearchSchema>;

const noteId = z.custom<NoteId>((value) => isId('note', value), 'Not a note id');

/** The task page's search params: its task note, open in the sheet. */
export const taskPageSearchSchema = z.object({ note: optional(noteId) });

export type TaskPageSearch = z.infer<typeof taskPageSearchSchema>;
export type TaskView = (typeof TASK_VIEWS)[number];
export type GroupBy = (typeof GROUP_BYS)[number];
export type SortParam = (typeof SORTS)[number];
export type StatusFilter = (typeof STATUS_FILTERS)[number];
export type PriorityFilter = (typeof PRIORITY_FILTERS)[number];
export type DueFilter = (typeof DUE_FILTERS)[number];

/** What `tasks.list` takes. */
export type TaskListInput = NonNullable<Parameters<typeof ipc.tasks.list.query>[0]>;
export type TaskFilter = NonNullable<TaskListInput['filter']>;
export type TaskSort = NonNullable<TaskListInput['sort']>;

const SORT_BY: Record<SortParam, TaskSort['sortBy']> = {
  priority: 'priority',
  due_date: 'dueDate',
  status: 'status',
  created_at: 'createdAt',
  updated_at: 'updatedAt',
};

const SORT_PARAM: Record<AppSettings['tasks']['defaultSort'], SortParam> = {
  priority: 'priority',
  dueDate: 'due_date',
  status: 'status',
};

export const STATUS_OF: Record<Exclude<StatusFilter, 'open' | 'all'>, TaskStatus> = {
  not_started: TaskStatus.NOT_STARTED,
  in_progress: TaskStatus.IN_PROGRESS,
  completed: TaskStatus.COMPLETED,
  cancelled: TaskStatus.CANCELLED,
};

export const PRIORITY_OF: Record<PriorityFilter, TaskPriority> = {
  high: TaskPriority.HIGH,
  medium: TaskPriority.MEDIUM,
  low: TaskPriority.LOW,
};

// what a sort reads best in, when the URL doesn't say: the most urgent first for priority, the
// soonest first for dates, the newest first for times
const DEFAULT_DIRECTION: Record<SortParam, 'asc' | 'desc'> = {
  priority: 'desc',
  due_date: 'asc',
  status: 'asc',
  created_at: 'desc',
  updated_at: 'desc',
};

/** The page's state, with every missing param filled from the settings. */
export interface ResolvedTasksSearch {
  view: TaskView;
  groupBy: GroupBy;
  sort: SortParam;
  dir: 'asc' | 'desc';
  status: StatusFilter;
  priority: PriorityFilter | undefined;
  project: ProjectId | 'none' | undefined;
  due: DueFilter | undefined;
  source: 'local' | 'external' | undefined;
  open: TaskId | undefined;
}

export function resolveTasksSearch(
  search: TasksSearch,
  settings: Pick<AppSettings, 'tasks'>,
): ResolvedTasksSearch {
  const sort = search.sort ?? SORT_PARAM[settings.tasks.defaultSort];
  return {
    view: search.view ?? settings.tasks.defaultView,
    groupBy: search.group_by ?? 'project',
    sort,
    dir: search.dir ?? DEFAULT_DIRECTION[sort],
    status: search.status ?? (settings.tasks.showCompletedTasks ? 'all' : 'open'),
    priority: search.priority,
    project: search.project,
    due: search.due,
    source: search.source,
    open: search.open,
  };
}

/** Whether any filter narrows the list (the "no results" state offers to clear them). */
export function hasFilters(search: TasksSearch): boolean {
  return (
    search.status !== undefined ||
    search.priority !== undefined ||
    search.project !== undefined ||
    search.due !== undefined ||
    search.source !== undefined
  );
}

/** The change that removes every filter (the view, sort and sheet kept): "Clear filters". */
export const CLEAR_FILTERS: Partial<TasksSearch> = {
  status: undefined,
  priority: undefined,
  project: undefined,
  due: undefined,
  source: undefined,
};

/**
 * The `dueBefore`/`dueOn`/`dueAfter` filter for a due bucket, on the day `today` falls in (local
 * time). Core compares `dueBefore` and `dueAfter` strictly. "This week" is today and the six days
 * after it; overdue is before today, and open only.
 */
export function dueFilter(
  due: DueFilter | 'later' | 'this_week_after_today',
  today: Date,
): TaskFilter {
  const start = DateTime.fromJSDate(today).startOf('day');
  const weekEnd = start.plus({ days: 7 });
  switch (due) {
    case 'overdue':
      return { dueBefore: start.toJSDate(), excludeClosed: true };
    case 'today':
      return { dueOn: start.toJSDate() };
    case 'week':
      return {
        dueAfter: start.minus({ milliseconds: 1 }).toJSDate(),
        dueBefore: weekEnd.toJSDate(),
      };
    case 'this_week_after_today':
      return {
        dueAfter: start.plus({ days: 1 }).minus({ milliseconds: 1 }).toJSDate(),
        dueBefore: weekEnd.toJSDate(),
      };
    case 'later':
      return { dueAfter: weekEnd.minus({ milliseconds: 1 }).toJSDate() };
    case 'none':
      return { noDueDate: true };
  }
}

/**
 * The page's filter, as `tasks.list` takes it: each param mapped to core's field, top-level tasks
 * only (a board column's cards; the list views drop `excludeSubtasks`, `taskListInput`).
 */
export function taskFilterOf(resolved: ResolvedTasksSearch, today: Date): TaskFilter {
  const filter: TaskFilter = { excludeSubtasks: true };
  if (resolved.status === 'open') filter.excludeClosed = true;
  else if (resolved.status !== 'all') filter.status = STATUS_OF[resolved.status];
  if (resolved.priority) filter.priority = PRIORITY_OF[resolved.priority];
  if (resolved.project) filter.projectId = resolved.project === 'none' ? null : resolved.project;
  if (resolved.due) Object.assign(filter, dueFilter(resolved.due, today));
  if (resolved.source) filter.origin = resolved.source;
  return filter;
}

export function taskSortOf(resolved: ResolvedTasksSearch): TaskSort {
  return { sortBy: SORT_BY[resolved.sort], direction: resolved.dir };
}

/** How many tasks a page of `tasks.list` asks for. */
export const TASKS_PAGE_SIZE = 100;

/**
 * The list and group views' input: the page's filter and sort, without the cursor. Unlike the
 * board's columns, they list subtasks too, each in its place in the sort with its parent's pill,
 * as Figma's list draws them (`7155:5231`).
 */
export function taskListInput(
  resolved: ResolvedTasksSearch,
  today: Date,
  extra: TaskFilter = {},
): TaskListInput {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { excludeSubtasks, ...filter } = taskFilterOf(resolved, today);
  return {
    filter: { ...filter, ...extra },
    sort: taskSortOf(resolved),
    limit: TASKS_PAGE_SIZE,
  };
}
