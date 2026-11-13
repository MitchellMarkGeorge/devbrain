import {
  ArrowUpDown,
  CalendarDays,
  CircleCheck,
  CircleSlash,
  Clock,
  Folder,
  LayoutGrid,
  Link,
  List,
  ListFilter,
  Plus,
  Type,
  type LucideIcon,
} from 'lucide-react';
import type { ProjectId } from '@common/ids';
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
  ToggleGroup,
  ToggleGroupItem,
  useWorkspaceShell,
} from '../../../components';
import { PickerSearchFilter } from '../../search/picker-search';
import { ProjectItems } from '../../tasks/menus/TaskMenus';
import { useProjectOptions } from '../../tasks/menus/use-project-options';
import { usePickedProject } from '../../tasks/menus/use-project-search';
import {
  CLEAR_FILTERS,
  type LinkFilter,
  type NoteSortParam,
  type NoteView,
  type NotesSearch,
  type ResolvedNotesSearch,
} from '../search';

type SetSearch = (patch: Partial<NotesSearch>) => void;

export const VIEW_LABELS: Record<NoteView, string> = { list: 'List', card: 'Cards' };
export const VIEW_ICONS: Record<NoteView, LucideIcon> = { list: List, card: LayoutGrid };

export const SORT_LABELS: Record<NoteSortParam, string> = {
  updated_at: 'Last edited',
  created_at: 'Created',
  title: 'Title',
};
const SORT_ICONS: Record<NoteSortParam, LucideIcon> = {
  updated_at: Clock,
  created_at: Plus,
  title: Type,
};

export const LINK_LABELS: Record<LinkFilter, string> = {
  event: 'Linked to an event',
  task: 'Linked to a task',
  none: 'Not linked',
};
const LINK_ICONS: Record<LinkFilter, LucideIcon> = {
  event: CalendarDays,
  task: CircleCheck,
  none: CircleSlash,
};

/** What the Filter button says: All, or the filters that narrow the list. */
function filterValue(resolved: ResolvedNotesSearch, projectName: string | undefined): string {
  const parts: string[] = [];
  if (resolved.project)
    parts.push(resolved.project === 'none' ? 'No project' : (projectName ?? 'Project'));
  if (resolved.link) parts.push(LINK_LABELS[resolved.link]);
  return parts.length > 0 ? parts.join(' · ') : 'All';
}

/** Filter ▾: the project (or none), and what the note links to. */
export function NotesFilterMenu({
  resolved,
  setSearch,
}: {
  resolved: ResolvedNotesSearch;
  setSearch: SetSearch;
}) {
  const { size } = useWorkspaceShell();
  const projectName = usePickedProject(
    resolved.project === 'none' ? null : resolved.project,
    useProjectOptions(),
  )?.name;
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button
            icon={ListFilter}
            value={filterValue(resolved, projectName)}
            hideValue={size === 'compact'}
          >
            Filter
          </Button>
        }
      />
      <DropdownMenuContent width="sm" align="start">
        <DropdownMenuGroup>
          <DropdownMenuLabel>Filter</DropdownMenuLabel>
          <PickerSearchFilter>
            <DropdownMenuSub>
              <DropdownMenuSubTrigger icon={Folder}>Project</DropdownMenuSubTrigger>
              <DropdownMenuSubContent width="lg">
                <ProjectItems
                  projectId={
                    resolved.project === 'none' ? null : (resolved.project as ProjectId | undefined)
                  }
                  onPick={(project) => setSearch({ project: project === null ? 'none' : project })}
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
          </PickerSearchFilter>
          <DropdownMenuSub>
            <DropdownMenuSubTrigger icon={Link}>Link</DropdownMenuSubTrigger>
            <DropdownMenuSubContent width="sm">
              <DropdownMenuRadioGroup
                value={resolved.link ?? ''}
                onValueChange={(link: string) =>
                  setSearch({ link: link === '' ? undefined : (link as LinkFilter) })
                }
              >
                <DropdownMenuRadioItem value="" icon={CircleSlash}>
                  Any
                </DropdownMenuRadioItem>
                {(Object.keys(LINK_LABELS) as LinkFilter[]).map((link) => (
                  <DropdownMenuRadioItem key={link} value={link} icon={LINK_ICONS[link]}>
                    {LINK_LABELS[link]}
                  </DropdownMenuRadioItem>
                ))}
              </DropdownMenuRadioGroup>
            </DropdownMenuSubContent>
          </DropdownMenuSub>
        </DropdownMenuGroup>
        <DropdownMenuSeparator />
        <DropdownMenuItem icon={CircleSlash} onClick={() => setSearch(CLEAR_FILTERS)}>
          Clear filters
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/** Sort ▾: Last edited, Created or Title, then the order. */
export function NotesSortMenu({
  resolved,
  setSearch,
}: {
  resolved: ResolvedNotesSearch;
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
            onValueChange={(sort: string) =>
              setSearch({ sort: sort as NoteSortParam, dir: undefined })
            }
          >
            {(Object.keys(SORT_LABELS) as NoteSortParam[]).map((sort) => (
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

/** Sort, the list / cards toggle, and New Note. */
export function NotesToolbarEnd({
  resolved,
  setSearch,
  onNewNote,
}: {
  resolved: ResolvedNotesSearch;
  setSearch: SetSearch;
  onNewNote: () => void;
}) {
  return (
    <>
      <NotesSortMenu resolved={resolved} setSearch={setSearch} />
      <ToggleGroup
        value={resolved.view}
        aria-label="View"
        onValueChange={(view) => {
          if (view) setSearch({ view: view as NoteView });
        }}
      >
        {(Object.keys(VIEW_LABELS) as NoteView[]).map((view) => (
          <ToggleGroupItem
            key={view}
            value={view}
            icon={VIEW_ICONS[view]}
            aria-label={VIEW_LABELS[view]}
          />
        ))}
      </ToggleGroup>
      <Button icon={Plus} onClick={onNewNote}>
        New Note
      </Button>
    </>
  );
}
