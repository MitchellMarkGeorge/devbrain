import {
  ArrowUpDown,
  Calendar,
  ChevronsUp,
  Circle,
  CircleAlert,
  CircleSlash,
  Clock,
  Cloud,
  Folder,
  Group,
  Kanban,
  List,
  ListFilter,
  Plus,
  type LucideIcon,
  RotateCcw,
} from 'lucide-react';
import { useSuspenseQuery } from '@tanstack/react-query';
import type { ProjectId } from '@common/ids';
import { TaskStatus } from '@common/types';
import {
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuFilter,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
  PriorityIcon,
  StatusIcon,
  ToggleGroup,
  ToggleGroupItem,
  useWorkspaceShell,
  type IconSource,
} from '@renderer/components';
import { trpc } from '@renderer/ipc';
import { ProjectItems } from '../menus/TaskMenus';
import { useCreateTask } from '../../hooks/use-create-task';
import { useProjectOptions } from '../../hooks/use-project-options';
import { useTasksSearch } from '../../hooks/use-tasks-search';
import {
  CLEAR_FILTERS,
  PRIORITY_OF,
  resolveTasksSearch,
  STATUS_OF,
  type DueFilter,
  type GroupBy,
  type PriorityFilter,
  type ResolvedTasksSearch,
  type SortParam,
  type StatusFilter,
  type TaskView,
  type TasksSearch,
} from '../../api/search';

type SetSearch = (patch: Partial<TasksSearch>) => void;

export const VIEW_LABELS: Record<TaskView, string> = {
  list: 'List',
  group: 'Grouped',
  board: 'Board',
};
export const VIEW_ICONS: Record<TaskView, LucideIcon> = { list: List, group: Group, board: Kanban };

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
  priority: ChevronsUp,
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
  priority: ChevronsUp,
  due: Calendar,
};

/** What the Filter button says: the status, and how many more filters narrow the list. */
function filterValue(resolved: ResolvedTasksSearch, projectName: string | undefined): string {
  const parts = [STATUS_FILTER_LABELS[resolved.status]];
  if (resolved.priority) parts.push(PRIORITY_FILTER_LABELS[resolved.priority]);
  if (resolved.project)
    parts.push(resolved.project === 'none' ? 'No project' : (projectName ?? 'Project'));
  if (resolved.due) parts.push(DUE_FILTER_LABELS[resolved.due]);
  if (resolved.source) parts.push(resolved.source === 'external' ? 'Synced' : 'Local');
  return parts.join(' · ');
}

// a radio submenu of a filter: "Any" clears it
function FilterSubmenu<Value extends string>({
  icon,
  label,
  value,
  options,
  any = 'Any',
  anyIcon = CircleSlash,
  onChange,
}: {
  icon: LucideIcon;
  label: string;
  /** the first item, which removes the filter from the URL; null for none */
  any?: string | null;
  anyIcon?: IconSource;
  value: Value | undefined;
  // a Lucide icon, drawn at the menu's 16px, or an icon node that sizes itself (StatusIcon)
  options: { value: Value; label: string; icon: IconSource }[];
  onChange: (value: Value | undefined) => void;
}) {
  return (
    <DropdownMenuSub>
      <DropdownMenuSubTrigger icon={icon}>{label}</DropdownMenuSubTrigger>
      <DropdownMenuSubContent width="sm">
        <DropdownMenuRadioGroup
          value={value ?? ''}
          onValueChange={(next: string) => onChange(next === '' ? undefined : (next as Value))}
        >
          {any !== null && (
            <DropdownMenuRadioItem value="" icon={anyIcon}>
              {any}
            </DropdownMenuRadioItem>
          )}
          {options.map((option) => (
            <DropdownMenuRadioItem key={option.value} value={option.value} icon={option.icon}>
              {option.label}
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuSubContent>
    </DropdownMenuSub>
  );
}

/** Filter ▾ (Figma `7175:25639`): status, priority, project, due and source, one value each. */
export function FilterMenu({
  resolved,
  setSearch,
}: {
  resolved: ResolvedTasksSearch;
  setSearch: SetSearch;
}) {
  const { size } = useWorkspaceShell();
  // a project's Tasks tab has its project fixed: no Project filter
  const { search, project: fixedProject } = useTasksSearch();
  const settings = useSuspenseQuery(trpc.settings.get.queryOptions()).data;
  // the status the page shows with none in the URL: Open, or All with completed tasks shown
  const defaultStatus = resolveTasksSearch({}, settings).status;
  const projects = useProjectOptions();
  const projectName = fixedProject
    ? undefined
    : projects.find((project) => project.id === resolved.project)?.name;
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button
            icon={ListFilter}
            value={filterValue(
              fixedProject ? { ...resolved, project: undefined } : resolved,
              projectName,
            )}
            hideValue={size === 'compact'}
          >
            Filter
          </Button>
        }
      />
      <DropdownMenuContent width="sm" align="start">
        <DropdownMenuGroup>
          <DropdownMenuLabel>Filter</DropdownMenuLabel>
          <FilterSubmenu
            icon={Circle}
            label="Status"
            // back to the settings' default, which follows "Show completed tasks"
            any={`Default (${STATUS_FILTER_LABELS[defaultStatus]})`}
            anyIcon={RotateCcw}
            value={search.status}
            options={(Object.keys(STATUS_FILTER_LABELS) as StatusFilter[]).map((status) => ({
              value: status,
              label: STATUS_FILTER_LABELS[status],
              icon:
                status === 'open' || status === 'all' ? (
                  <StatusIcon status={TaskStatus.IN_PROGRESS} />
                ) : (
                  <StatusIcon status={STATUS_OF[status]} />
                ),
            }))}
            onChange={(status) => setSearch({ status })}
          />
          <FilterSubmenu
            icon={ChevronsUp}
            label="Priority"
            value={resolved.priority}
            options={(Object.keys(PRIORITY_FILTER_LABELS) as PriorityFilter[]).map((priority) => ({
              value: priority,
              label: PRIORITY_FILTER_LABELS[priority],
              icon: <PriorityIcon priority={PRIORITY_OF[priority]} />,
            }))}
            onChange={(priority) => setSearch({ priority })}
          />
          {!fixedProject && (
            <DropdownMenuFilter>
              <DropdownMenuSub>
                <DropdownMenuSubTrigger icon={Folder}>Project</DropdownMenuSubTrigger>
                <DropdownMenuSubContent width="lg">
                  <ProjectItems
                    projectId={
                      resolved.project === 'none'
                        ? null
                        : (resolved.project as ProjectId | undefined)
                    }
                    onPick={(project) =>
                      setSearch({ project: project === null ? 'none' : project })
                    }
                  />
                  {resolved.project && (
                    <>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem
                        icon={CircleSlash}
                        onClick={() => setSearch({ project: undefined })}
                      >
                        Any project
                      </DropdownMenuItem>
                    </>
                  )}
                </DropdownMenuSubContent>
              </DropdownMenuSub>
            </DropdownMenuFilter>
          )}
          <FilterSubmenu
            icon={Calendar}
            label="Due"
            value={resolved.due}
            options={(Object.keys(DUE_FILTER_LABELS) as DueFilter[]).map((due) => {
              return { value: due, label: DUE_FILTER_LABELS[due], icon: DUE_ICONS[due] };
            })}
            onChange={(due) => setSearch({ due })}
          />
          <FilterSubmenu
            icon={Cloud}
            label="Source"
            value={resolved.source}
            options={[
              { value: 'local', label: 'Local', icon: Circle },
              { value: 'external', label: 'Synced', icon: Cloud },
            ]}
            onChange={(source) => setSearch({ source })}
          />
        </DropdownMenuGroup>
        <DropdownMenuSeparator />
        <DropdownMenuItem icon={CircleSlash} onClick={() => setSearch(CLEAR_FILTERS)}>
          Clear filters
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/** Group by ▾, in the group view. */
export function GroupByMenu({
  resolved,
  setSearch,
}: {
  resolved: ResolvedTasksSearch;
  setSearch: SetSearch;
}) {
  const { size } = useWorkspaceShell();
  const { project: fixedProject } = useTasksSearch();
  // within one project, grouping by project makes one group
  const groupBys = (Object.keys(GROUP_BY_LABELS) as GroupBy[]).filter(
    (groupBy) => !fixedProject || groupBy !== 'project',
  );
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button
            icon={Group}
            value={GROUP_BY_LABELS[resolved.groupBy]}
            hideValue={size === 'compact'}
          >
            Group by
          </Button>
        }
      />
      <DropdownMenuContent width="sm" align="start">
        <DropdownMenuGroup>
          <DropdownMenuLabel>Group by</DropdownMenuLabel>
          <DropdownMenuRadioGroup
            value={resolved.groupBy}
            onValueChange={(group_by: string) => setSearch({ group_by: group_by as GroupBy })}
          >
            {groupBys.map((groupBy) => (
              <DropdownMenuRadioItem key={groupBy} value={groupBy} icon={GROUP_BY_ICONS[groupBy]}>
                {GROUP_BY_LABELS[groupBy]}
              </DropdownMenuRadioItem>
            ))}
          </DropdownMenuRadioGroup>
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/** Sort ▾ (Figma `7175:26184`): what to sort by, then the order. */
export function SortMenu({
  resolved,
  setSearch,
}: {
  resolved: ResolvedTasksSearch;
  setSearch: SetSearch;
}) {
  const { size } = useWorkspaceShell();
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button
            icon={ArrowUpDown}
            value={SORT_LABELS[resolved.sort]}
            hideValue={size === 'compact'}
          >
            Sort
          </Button>
        }
      />
      <DropdownMenuContent width="sm" align="end">
        <DropdownMenuGroup>
          <DropdownMenuLabel>Sort by</DropdownMenuLabel>
          <DropdownMenuRadioGroup
            value={resolved.sort}
            // a new sort takes its own natural order
            onValueChange={(sort: string) => setSearch({ sort: sort as SortParam, dir: undefined })}
          >
            {(Object.keys(SORT_LABELS) as SortParam[]).map((sort) => (
              <DropdownMenuRadioItem key={sort} value={sort} icon={SORT_ICONS[sort]}>
                {SORT_LABELS[sort]}
              </DropdownMenuRadioItem>
            ))}
          </DropdownMenuRadioGroup>
        </DropdownMenuGroup>
        <DropdownMenuSeparator />
        <DropdownMenuGroup>
          <DropdownMenuLabel>Order</DropdownMenuLabel>
          <DropdownMenuRadioGroup
            value={resolved.dir}
            onValueChange={(dir: string) => setSearch({ dir: dir as 'asc' | 'desc' })}
          >
            <DropdownMenuRadioItem value="asc" icon={ArrowUpDown}>
              Ascending
            </DropdownMenuRadioItem>
            <DropdownMenuRadioItem value="desc" icon={ArrowUpDown}>
              Descending
            </DropdownMenuRadioItem>
          </DropdownMenuRadioGroup>
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export function TasksToolbarStart({
  resolved,
  setSearch,
}: {
  resolved: ResolvedTasksSearch;
  setSearch: SetSearch;
}) {
  return (
    <>
      <FilterMenu resolved={resolved} setSearch={setSearch} />
      {resolved.view === 'group' && <GroupByMenu resolved={resolved} setSearch={setSearch} />}
    </>
  );
}

/** Sort, the list / grouped / board toggle, and New Task (with the project filter's project). */
export function TasksToolbarEnd({
  resolved,
  setSearch,
}: {
  resolved: ResolvedTasksSearch;
  setSearch: SetSearch;
}) {
  const createTask = useCreateTask();
  return (
    <>
      {resolved.view !== 'board' && <SortMenu resolved={resolved} setSearch={setSearch} />}
      <ToggleGroup
        value={resolved.view}
        aria-label="View"
        onValueChange={(view) => {
          if (view) setSearch({ view: view as TaskView, open: undefined });
        }}
      >
        {(Object.keys(VIEW_LABELS) as TaskView[]).map((view) => (
          <ToggleGroupItem
            key={view}
            value={view}
            icon={VIEW_ICONS[view]}
            aria-label={VIEW_LABELS[view]}
          />
        ))}
      </ToggleGroup>
      <Button
        icon={Plus}
        onClick={() =>
          createTask({
            defaults: {
              projectId:
                resolved.project && resolved.project !== 'none' ? resolved.project : undefined,
            },
          })
        }
      >
        New Task
      </Button>
    </>
  );
}
