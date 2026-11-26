import {
  Calendar,
  ChartNoAxesColumnIncreasing,
  Circle,
  CircleAlert,
  CircleDashed,
  CircleSlash,
  Clock,
  Cloud,
  Folder,
  Kanban,
  List,
  Plus,
  type LucideIcon,
} from 'lucide-react';
import { useSuspenseQuery } from '@tanstack/react-query';
import {
  Button,
  ListDisplay,
  ListFilters,
  ListStatusChip,
  ProjectGlyph,
  PriorityIcon,
  StatusIcon,
  useWorkspaceShell,
  type ListFilterField,
  type ListToolbarOption,
} from '@renderer/components';
import { trpc } from '@renderer/ipc';
import { useCreateTask } from '../../hooks/use-create-task';
import { useProjectOptions } from '../../hooks/use-project-options';
import { useTasksSearch } from '../../hooks/use-tasks-search';
import { listParam } from '@renderer/shared/lib/search-params';
import {
  CLEAR_FILTERS,
  DUE_FILTERS,
  GROUP_BYS,
  PRIORITY_FILTERS,
  PRIORITY_OF,
  resolveTasksSearch,
  SORTS,
  STATUS_OF,
  type DueFilter,
  type GroupBy,
  type PriorityFilter,
  type ProjectFilter,
  type ResolvedTasksSearch,
  type SortParam,
  type StatusFilter,
  type TasksSearch,
} from '../../api/search';

type SetSearch = (patch: Partial<TasksSearch>) => void;

export const STATUS_FILTER_LABELS: Record<StatusFilter, string> = {
  open: 'Open',
  all: 'All',
  not_started: 'Not started',
  in_progress: 'In progress',
  completed: 'Completed',
  cancelled: 'Cancelled',
};
export const PRIORITY_FILTER_LABELS: Record<PriorityFilter, string> = {
  high: 'High',
  medium: 'Medium',
  low: 'Low',
  none: 'No priority',
};
export const DUE_FILTER_LABELS: Record<DueFilter, string> = {
  overdue: 'Overdue',
  today: 'Today',
  week: 'This week',
  none: 'No due date',
};
const DUE_ICONS: Record<DueFilter, LucideIcon> = {
  overdue: CircleAlert,
  today: Calendar,
  week: Calendar,
  none: CircleSlash,
};
export const SORT_LABELS: Record<SortParam, string> = {
  priority: 'Priority',
  due_date: 'Due date',
  status: 'Status',
  updated_at: 'Last updated',
  created_at: 'Created',
};
const SORT_ICONS: Record<SortParam, LucideIcon> = {
  priority: ChartNoAxesColumnIncreasing,
  due_date: Calendar,
  status: Circle,
  updated_at: Clock,
  created_at: Plus,
};
export const GROUP_BY_LABELS: Record<GroupBy, string> = {
  project: 'Project',
  status: 'Status',
  priority: 'Priority',
  due: 'Due date',
};
const GROUP_BY_ICONS: Record<GroupBy, LucideIcon> = {
  project: Folder,
  status: Circle,
  priority: ChartNoAxesColumnIncreasing,
  due: Calendar,
};

// the scopes that span several statuses, then each status alone
const STATUS_SCOPES: ListToolbarOption<StatusFilter>[] = (['open', 'all'] as const).map(
  (status) => ({ value: status, label: STATUS_FILTER_LABELS[status] }),
);
const STATUS_OPTIONS: ListToolbarOption<StatusFilter>[] = (
  ['not_started', 'in_progress', 'completed', 'cancelled'] as const
).map((status) => ({
  value: status,
  label: STATUS_FILTER_LABELS[status],
  icon: <StatusIcon status={STATUS_OF[status]} />,
}));

const SORT_OPTIONS: ListToolbarOption<SortParam>[] = SORTS.map((sort) => ({
  value: sort,
  label: SORT_LABELS[sort],
  icon: SORT_ICONS[sort],
}));

const LAYOUTS: ListToolbarOption<'list' | 'board'>[] = [
  { value: 'list', label: 'List', icon: List },
  { value: 'board', label: 'Board', icon: Kanban },
];

/**
 * Which tasks are shown: the Status chip (Open or All, or one status; the default follows "Show
 * completed tasks") and the Filter button, counting the filters that are set (priority, due,
 * source, project). Priority and project hold several values, due and source one. A project's
 * Tasks tab has its project fixed: no Project filter.
 */
export function TasksToolbarStart({
  resolved,
  setSearch,
}: {
  resolved: ResolvedTasksSearch;
  setSearch: SetSearch;
}) {
  const compact = useWorkspaceShell().size === 'compact';
  const { search, project: fixedProject } = useTasksSearch();
  const settings = useSuspenseQuery(trpc.settings.get.queryOptions()).data;
  // the status the page shows with none in the URL: Open, or All with completed tasks shown
  const defaultStatus = resolveTasksSearch({}, settings).status;
  const projects = useProjectOptions();

  const fields: ListFilterField[] = [
    {
      id: 'priority',
      label: 'Priority',
      icon: ChartNoAxesColumnIncreasing,
      options: PRIORITY_FILTERS.map((priority) => ({
        value: priority,
        label: PRIORITY_FILTER_LABELS[priority],
        icon: <PriorityIcon priority={PRIORITY_OF[priority]} />,
      })),
      multiple: true,
      value: resolved.priority,
      onChange: (priority) => setSearch({ priority: listParam(priority as PriorityFilter[]) }),
    },
    {
      id: 'due',
      label: 'Due',
      icon: Calendar,
      options: DUE_FILTERS.map((due) => ({
        value: due,
        label: DUE_FILTER_LABELS[due],
        icon: DUE_ICONS[due],
      })),
      value: resolved.due,
      onChange: (due) => setSearch({ due: due as DueFilter | undefined }),
    },
    {
      id: 'source',
      label: 'Source',
      icon: Cloud,
      options: [
        { value: 'local', label: 'Local', icon: Circle },
        { value: 'external', label: 'Synced', icon: Cloud },
      ],
      value: resolved.source,
      onChange: (source) => setSearch({ source: source as 'local' | 'external' | undefined }),
    },
  ];
  if (!fixedProject) {
    fields.push({
      id: 'project',
      label: 'Project',
      icon: Folder,
      search: 'Search projects…',
      options: [
        ...projects.map((project) => ({
          value: project.id,
          label: project.name,
          icon: <ProjectGlyph color={project.color} />,
        })),
        { value: 'none', label: 'No project', icon: CircleSlash },
      ],
      multiple: true,
      value: resolved.project,
      onChange: (project) => setSearch({ project: listParam(project as ProjectFilter[]) }),
    });
  }

  return (
    <>
      <ListStatusChip
        icon={CircleDashed}
        options={STATUS_SCOPES}
        statuses={STATUS_OPTIONS}
        value={resolved.status}
        active={resolved.status !== defaultStatus}
        compact={compact}
        // the default leaves the URL, so it goes on following the setting
        onChange={(status) => setSearch({ status: status === defaultStatus ? undefined : status })}
      />
      <ListFilters
        fields={fields}
        // the Status chip is not one of the filters: it keeps what the URL says
        onClear={() => setSearch({ ...CLEAR_FILTERS, status: search.status })}
      />
    </>
  );
}

/**
 * How the tasks are drawn: Display (List or Board; in the list, the grouping and the sort). On a
 * project's Tasks tab, New Task too, which files the task in the project; elsewhere the title
 * bar's New creates one.
 */
export function TasksToolbarEnd({
  resolved,
  setSearch,
}: {
  resolved: ResolvedTasksSearch;
  setSearch: SetSearch;
}) {
  const compact = useWorkspaceShell().size === 'compact';
  const { search, project: fixedProject } = useTasksSearch();
  const createTask = useCreateTask();
  const board = resolved.view === 'board';
  // within one project, grouping by project makes one group
  const groupBys = GROUP_BYS.filter((groupBy) => !fixedProject || groupBy !== 'project');
  return (
    <>
      <ListDisplay
        compact={compact}
        layout={{
          options: LAYOUTS,
          value: board ? 'board' : 'list',
          onChange: (layout) =>
            setSearch({
              // back from the board to the list as it was: grouped, if the URL still says how
              view: layout === 'board' ? 'board' : search.group_by ? 'group' : 'list',
              open: undefined,
            }),
        }}
        groupBy={
          board
            ? undefined
            : {
                options: [
                  { value: 'none', label: 'None', icon: CircleSlash },
                  ...groupBys.map((groupBy) => ({
                    value: groupBy,
                    label: GROUP_BY_LABELS[groupBy],
                    icon: GROUP_BY_ICONS[groupBy],
                  })),
                ],
                value: resolved.view === 'group' ? resolved.groupBy : 'none',
                // the URL's `view` stays list or group: a grouped list is the group view
                onChange: (groupBy: GroupBy | 'none') =>
                  setSearch(
                    groupBy === 'none'
                      ? { view: 'list', group_by: undefined }
                      : { view: 'group', group_by: groupBy },
                  ),
              }
        }
        sort={
          board
            ? undefined
            : {
                options: SORT_OPTIONS,
                value: resolved.sort,
                // a new sort takes its own natural order
                onChange: (sort) => setSearch({ sort, dir: undefined }),
                dir: resolved.dir,
                onDirChange: (dir) => setSearch({ dir }),
              }
        }
        note={board ? 'The board groups tasks by status.' : undefined}
      />
      {fixedProject && (
        <Button
          variant="outline"
          icon={Plus}
          onClick={() => createTask({ defaults: { projectId: fixedProject } })}
        >
          New Task
        </Button>
      )}
    </>
  );
}
