import {
  ArrowUpDown,
  Calendar,
  Circle,
  CircleSlash,
  Clock,
  Cloud,
  LayoutGrid,
  List,
  ListFilter,
  Plus,
  type LucideIcon,
} from 'lucide-react';
import {
  Button,
  DropdownMenu,
  DropdownMenuContent,
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
  ProjectStatusIcon,
  ToggleGroup,
  ToggleGroupItem,
  useWorkspaceShell,
} from '@renderer/components';
import { useCreateProject } from '../../hooks/use-create-project';
import {
  CLEAR_PROJECT_FILTERS,
  PROJECT_STATUS_OF,
  type ProjectSortParam,
  type ProjectStatusFilter,
  type ProjectView,
  type ProjectsSearch,
  type ResolvedProjectsSearch,
} from '../../api/search';

type SetSearch = (patch: Partial<ProjectsSearch>) => void;

export const PROJECT_VIEW_LABELS: Record<ProjectView, string> = { list: 'List', card: 'Cards' };
export const PROJECT_VIEW_ICONS: Record<ProjectView, LucideIcon> = {
  list: List,
  card: LayoutGrid,
};

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
const SORT_ICONS: Record<ProjectSortParam, LucideIcon> = {
  due_date: Calendar,
  status: Circle,
  updated_at: Clock,
  created_at: Plus,
};

/** What the Filter button says: the status, and the source when one is picked. */
function filterValue(resolved: ResolvedProjectsSearch): string {
  const parts = [PROJECT_STATUS_FILTER_LABELS[resolved.status]];
  if (resolved.source) parts.push(resolved.source === 'external' ? 'Synced' : 'Local');
  return parts.join(' · ');
}

/** Filter ▾: the status (Active by default, or All) and the source. */
export function ProjectsFilterMenu({
  resolved,
  setSearch,
}: {
  resolved: ResolvedProjectsSearch;
  setSearch: SetSearch;
}) {
  const { size } = useWorkspaceShell();
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button icon={ListFilter} value={filterValue(resolved)} hideValue={size === 'compact'}>
            Filter
          </Button>
        }
      />
      <DropdownMenuContent width="sm" align="start">
        <DropdownMenuGroup>
          <DropdownMenuLabel>Status</DropdownMenuLabel>
          <DropdownMenuRadioGroup
            value={resolved.status}
            // Active is the default, so it leaves the URL
            onValueChange={(status: string) =>
              setSearch({
                status: status === 'active' ? undefined : (status as ProjectStatusFilter),
              })
            }
          >
            {(Object.keys(PROJECT_STATUS_FILTER_LABELS) as ProjectStatusFilter[]).map((status) => (
              <DropdownMenuRadioItem
                key={status}
                value={status}
                icon={
                  status === 'all' ? (
                    Circle
                  ) : (
                    <ProjectStatusIcon status={PROJECT_STATUS_OF[status]} />
                  )
                }
              >
                {PROJECT_STATUS_FILTER_LABELS[status]}
              </DropdownMenuRadioItem>
            ))}
          </DropdownMenuRadioGroup>
          <DropdownMenuSeparator />
          <DropdownMenuSub>
            <DropdownMenuSubTrigger icon={Cloud}>Source</DropdownMenuSubTrigger>
            <DropdownMenuSubContent width="sm">
              <DropdownMenuRadioGroup
                value={resolved.source ?? ''}
                onValueChange={(source: string) =>
                  setSearch({ source: source === '' ? undefined : (source as 'local') })
                }
              >
                <DropdownMenuRadioItem value="" icon={CircleSlash}>
                  Any
                </DropdownMenuRadioItem>
                <DropdownMenuRadioItem value="local" icon={Circle}>
                  Local
                </DropdownMenuRadioItem>
                <DropdownMenuRadioItem value="external" icon={Cloud}>
                  Synced
                </DropdownMenuRadioItem>
              </DropdownMenuRadioGroup>
            </DropdownMenuSubContent>
          </DropdownMenuSub>
        </DropdownMenuGroup>
        <DropdownMenuSeparator />
        <DropdownMenuItem icon={CircleSlash} onClick={() => setSearch(CLEAR_PROJECT_FILTERS)}>
          Clear filters
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/** Sort ▾: what to sort by, then the order. */
export function ProjectsSortMenu({
  resolved,
  setSearch,
}: {
  resolved: ResolvedProjectsSearch;
  setSearch: SetSearch;
}) {
  const { size } = useWorkspaceShell();
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button
            icon={ArrowUpDown}
            value={PROJECT_SORT_LABELS[resolved.sort]}
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
            onValueChange={(sort: string) =>
              setSearch({ sort: sort as ProjectSortParam, dir: undefined })
            }
          >
            {(Object.keys(PROJECT_SORT_LABELS) as ProjectSortParam[]).map((sort) => (
              <DropdownMenuRadioItem key={sort} value={sort} icon={SORT_ICONS[sort]}>
                {PROJECT_SORT_LABELS[sort]}
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

/** Sort, the list / cards toggle, and New Project. */
export function ProjectsToolbarEnd({
  resolved,
  setSearch,
}: {
  resolved: ResolvedProjectsSearch;
  setSearch: SetSearch;
}) {
  const createProject = useCreateProject();
  return (
    <>
      <ProjectsSortMenu resolved={resolved} setSearch={setSearch} />
      <ToggleGroup
        value={resolved.view}
        aria-label="View"
        onValueChange={(view) => {
          if (view) setSearch({ view: view === 'list' ? undefined : (view as ProjectView) });
        }}
      >
        {(Object.keys(PROJECT_VIEW_LABELS) as ProjectView[]).map((view) => (
          <ToggleGroupItem
            key={view}
            value={view}
            icon={PROJECT_VIEW_ICONS[view]}
            aria-label={PROJECT_VIEW_LABELS[view]}
          />
        ))}
      </ToggleGroup>
      <Button icon={Plus} onClick={() => createProject()}>
        New Project
      </Button>
    </>
  );
}
