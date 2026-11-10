import { z } from 'zod';
import { ProjectStatus } from '@common/types';
import type { ProjectId } from '@common/ids';
import type { ipc } from '../../ipc';
import { tasksSearchSchema, type TasksSearch } from '../tasks/search';

// The projects routes' search params (docs/renderer/implementation-plan.md, "Search params"):
// snake case names and values, each `.optional().catch(undefined)`, so a bad value drops that one
// field back to its default rather than failing the page. No default is written into the URL.

const optional = <T extends z.ZodType>(schema: T) => schema.optional().catch(undefined);

export const PROJECT_VIEWS = ['list', 'card'] as const;
export const PROJECT_STATUS_FILTERS = [
  'active',
  'all',
  'not_started',
  'on_hold',
  'completed',
] as const;
export const PROJECT_SORTS = ['due_date', 'created_at', 'updated_at', 'status'] as const;

export const projectsSearchSchema = z.object({
  view: optional(z.enum(PROJECT_VIEWS)),
  /** `active` (the default) is the projects in progress */
  status: optional(z.enum(PROJECT_STATUS_FILTERS)),
  sort: optional(z.enum(PROJECT_SORTS)),
  dir: optional(z.enum(['asc', 'desc'])),
  /** core's `origin`: synced from an integration, or not */
  source: optional(z.enum(['local', 'external'])),
});

export type ProjectsSearch = z.infer<typeof projectsSearchSchema>;
export type ProjectView = (typeof PROJECT_VIEWS)[number];
export type ProjectStatusFilter = (typeof PROJECT_STATUS_FILTERS)[number];
export type ProjectSortParam = (typeof PROJECT_SORTS)[number];

/** What `projects.list` takes. */
export type ProjectListInput = NonNullable<Parameters<typeof ipc.projects.list.query>[0]>;

export const PROJECT_STATUS_OF: Record<Exclude<ProjectStatusFilter, 'all'>, ProjectStatus> = {
  active: ProjectStatus.ACTIVE,
  not_started: ProjectStatus.NOT_STARTED,
  on_hold: ProjectStatus.ON_HOLD,
  completed: ProjectStatus.COMPLETED,
};

const SORT_BY: Record<ProjectSortParam, 'dueDate' | 'createdAt' | 'updatedAt' | 'status'> = {
  due_date: 'dueDate',
  created_at: 'createdAt',
  updated_at: 'updatedAt',
  status: 'status',
};

// the soonest first for due dates, the newest first for times, Not started first for status
const DEFAULT_DIRECTION: Record<ProjectSortParam, 'asc' | 'desc'> = {
  due_date: 'asc',
  created_at: 'desc',
  updated_at: 'desc',
  status: 'asc',
};

/** The page's state, with every missing param filled with its default. */
export interface ResolvedProjectsSearch {
  view: ProjectView;
  status: ProjectStatusFilter;
  sort: ProjectSortParam;
  dir: 'asc' | 'desc';
  source: 'local' | 'external' | undefined;
}

export function resolveProjectsSearch(search: ProjectsSearch): ResolvedProjectsSearch {
  const sort = search.sort ?? 'due_date';
  return {
    view: search.view ?? 'list',
    status: search.status ?? 'active',
    sort,
    dir: search.dir ?? DEFAULT_DIRECTION[sort],
    source: search.source,
  };
}

/** Whether a filter other than the default narrows the list (the empty state offers to clear it). */
export function hasProjectFilters(search: ProjectsSearch): boolean {
  return search.status !== undefined || search.source !== undefined;
}

/** "Clear filters": back to the default status (Active) and every source. */
export const CLEAR_PROJECT_FILTERS: Partial<ProjectsSearch> = {
  status: undefined,
  source: undefined,
};

/** How many projects a page of `projects.list` asks for. */
export const PROJECTS_PAGE_SIZE = 100;

/** The list's input, as `projects.list` takes it, without the cursor. */
export function projectListInput(resolved: ResolvedProjectsSearch): ProjectListInput {
  const filter: NonNullable<ProjectListInput['filter']> = {};
  if (resolved.status !== 'all') filter.status = PROJECT_STATUS_OF[resolved.status];
  if (resolved.source) filter.origin = resolved.source;
  return {
    filter,
    sort: { sortBy: SORT_BY[resolved.sort], direction: resolved.dir },
    limit: PROJECTS_PAGE_SIZE,
  };
}

// ---------- the project page ----------

export const PROJECT_TABS = ['overview', 'tasks', 'notes'] as const;
export type ProjectTab = (typeof PROJECT_TABS)[number];

/**
 * The project page's params: the tab (Overview by default), and on the Tasks tab the tasks
 * views' own (view, filters, sort, the board's sheet), all but the project, which is the page's.
 */
export const projectSearchSchema = tasksSearchSchema.omit({ project: true }).extend({
  tab: optional(z.enum(PROJECT_TABS)),
});

export type ProjectSearch = z.infer<typeof projectSearchSchema>;

/**
 * The Tasks tab's params as the tasks views read them: the page's, with its project fixed. Its
 * group view groups by status unless the URL says otherwise, as grouping by project makes one
 * group.
 */
export function projectTasksSearch(search: ProjectSearch, projectId: ProjectId): TasksSearch {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { tab, ...tasks } = search;
  const groupBy =
    tasks.group_by === undefined || tasks.group_by === 'project' ? 'status' : tasks.group_by;
  return { ...tasks, group_by: groupBy, project: projectId };
}
