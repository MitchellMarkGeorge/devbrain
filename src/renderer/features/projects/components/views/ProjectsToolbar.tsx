import {
  Calendar,
  Circle,
  CircleAlert,
  CircleDashed,
  CircleSlash,
  Clock,
  Cloud,
  LayoutGrid,
  List,
  Plus,
  type LucideIcon,
} from 'lucide-react';
import {
  ListDisplay,
  ListFilterButton,
  ListFilters,
  type ListFilterField,
  ListStatusChip,
  ProjectStatusIcon,
  useWorkspaceShell,
  type ListToolbarOption,
} from '@renderer/components';
import {
  PROJECT_DUE_FILTERS,
  PROJECT_SORTS,
  type ProjectDueFilter,
  PROJECT_STATUS_OF,
  type ProjectSortParam,
  type ProjectStatusFilter,
  type ProjectView,
  type ProjectsSearch,
  type ResolvedProjectsSearch,
} from '../../api/search';

type SetSearch = (patch: Partial<ProjectsSearch>) => void;

export const PROJECT_STATUS_FILTER_LABELS: Record<ProjectStatusFilter, string> = {
  active: 'Active',
  all: 'All',
  not_started: 'Not started',
  on_hold: 'On hold',
  completed: 'Completed',
};

export const PROJECT_SORT_LABELS: Record<ProjectSortParam, string> = {
  due_date: 'Due date',
  status: 'Status',
  updated_at: 'Last updated',
  created_at: 'Created',
};
export const PROJECT_DUE_LABELS: Record<ProjectDueFilter, string> = {
  overdue: 'Overdue',
  week: 'This week',
  month: 'This month',
  none: 'No due date',
};
const DUE_ICONS: Record<ProjectDueFilter, LucideIcon> = {
  overdue: CircleAlert,
  week: Calendar,
  month: Calendar,
  none: CircleSlash,
};
const SORT_ICONS: Record<ProjectSortParam, LucideIcon> = {
  due_date: Calendar,
  status: Circle,
  updated_at: Clock,
  created_at: Plus,
};

// Active (the default) and All, then each other status alone
const STATUS_SCOPES: ListToolbarOption<ProjectStatusFilter>[] = (['active', 'all'] as const).map(
  (status) => ({ value: status, label: PROJECT_STATUS_FILTER_LABELS[status] }),
);
const STATUS_OPTIONS: ListToolbarOption<ProjectStatusFilter>[] = (
  ['not_started', 'on_hold', 'completed'] as const
).map((status) => ({
  value: status,
  label: PROJECT_STATUS_FILTER_LABELS[status],
  icon: <ProjectStatusIcon status={PROJECT_STATUS_OF[status]} />,
}));

const SORT_OPTIONS: ListToolbarOption<ProjectSortParam>[] = PROJECT_SORTS.map((sort) => ({
  value: sort,
  label: PROJECT_SORT_LABELS[sort],
  icon: SORT_ICONS[sort],
}));

const LAYOUTS: ListToolbarOption<ProjectView>[] = [
  { value: 'list', label: 'List', icon: List },
  { value: 'card', label: 'Cards', icon: LayoutGrid },
];

/**
 * The fields the projects can be filtered by, with what the URL filters them to: when a project is
 * due, and its source. The
 * chip (`ProjectsToolbarStart`) and the Filter button (`ProjectsToolbarEnd`) both draw it.
 */
function useProjectFilterFields(
  resolved: ResolvedProjectsSearch,
  setSearch: SetSearch,
): { fields: ListFilterField[]; clear: () => void } {
  const fields: ListFilterField[] = [
    {
      id: 'due',
      label: 'Due',
      icon: Calendar,
      options: PROJECT_DUE_FILTERS.map((due) => ({
        value: due,
        label: PROJECT_DUE_LABELS[due],
        icon: DUE_ICONS[due],
      })),
      value: resolved.due,
      onChange: (due) => setSearch({ due: due as ProjectDueFilter | undefined }),
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
  return { fields, clear: () => setSearch({ source: undefined, due: undefined }) };
}

/** Which projects are shown: the Status chip (Active by default), then the Source chip if it is set. */
export function ProjectsToolbarStart({
  resolved,
  setSearch,
}: {
  resolved: ResolvedProjectsSearch;
  setSearch: SetSearch;
}) {
  const compact = useWorkspaceShell().size === 'compact';
  const { fields, clear } = useProjectFilterFields(resolved, setSearch);
  return (
    <>
      <ListStatusChip
        icon={CircleDashed}
        options={STATUS_SCOPES}
        statuses={STATUS_OPTIONS}
        value={resolved.status}
        active={resolved.status !== 'active'}
        compact={compact}
        // Active is the default, so it leaves the URL
        onChange={(status) => setSearch({ status: status === 'active' ? undefined : status })}
      />
      <ListFilters fields={fields} onClear={clear} />
    </>
  );
}

/** The Filter button, then how the projects are drawn: Display (List or Cards, and the sort). */
export function ProjectsToolbarEnd({
  resolved,
  setSearch,
}: {
  resolved: ResolvedProjectsSearch;
  setSearch: SetSearch;
}) {
  const compact = useWorkspaceShell().size === 'compact';
  const { fields, clear } = useProjectFilterFields(resolved, setSearch);
  return (
    <>
      <ListFilterButton fields={fields} onClear={clear} />
      <ListDisplay
        compact={compact}
        layout={{
          options: LAYOUTS,
          value: resolved.view,
          // the list is the default, so it leaves the URL
          onChange: (view) => setSearch({ view: view === 'list' ? undefined : view }),
        }}
        sort={{
          options: SORT_OPTIONS,
          value: resolved.sort,
          // a new sort takes its own natural order
          onChange: (sort) => setSearch({ sort, dir: undefined }),
          dir: resolved.dir,
          onDirChange: (dir) => setSearch({ dir }),
        }}
      />
    </>
  );
}
