import {
  CalendarDays,
  CircleCheck,
  CircleSlash,
  Clock,
  Folder,
  LayoutGrid,
  Link,
  List,
  Plus,
  Type,
  type LucideIcon,
} from 'lucide-react';
import type { ProjectId } from '@common/ids';
import { listParam } from '@renderer/shared/lib/search-params';
import {
  ListDisplay,
  ListFilters,
  ProjectGlyph,
  useWorkspaceShell,
  type ListToolbarOption,
} from '@renderer/components';
import { useProjectOptions } from '@renderer/features/tasks/hooks/use-project-options';
import {
  CLEAR_FILTERS,
  LINK_FILTERS,
  NOTE_SORTS,
  type LinkFilter,
  type NoteSortParam,
  type NoteView,
  type NotesSearch,
  type ResolvedNotesSearch,
} from '../../api/search';

type SetSearch = (patch: Partial<NotesSearch>) => void;

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
  event: 'An event',
  task: 'A task',
  none: 'Nothing',
};
const LINK_ICONS: Record<LinkFilter, LucideIcon> = {
  event: CalendarDays,
  task: CircleCheck,
  none: CircleSlash,
};

const SORT_OPTIONS: ListToolbarOption<NoteSortParam>[] = NOTE_SORTS.map((sort) => ({
  value: sort,
  label: SORT_LABELS[sort],
  icon: SORT_ICONS[sort],
}));

const LAYOUTS: ListToolbarOption<NoteView>[] = [
  { value: 'list', label: 'List', icon: List },
  { value: 'card', label: 'Cards', icon: LayoutGrid },
];

/**
 * Which notes are shown: the Filter button, counting the filters that are set (what a note links
 * to, its project). Both filters hold several values.
 */
export function NotesToolbarStart({
  resolved,
  setSearch,
}: {
  resolved: ResolvedNotesSearch;
  setSearch: SetSearch;
}) {
  const projects = useProjectOptions();
  return (
    <ListFilters
      fields={[
        {
          id: 'link',
          label: 'Linked to',
          icon: Link,
          options: LINK_FILTERS.map((link) => ({
            value: link,
            label: LINK_LABELS[link],
            icon: LINK_ICONS[link],
          })),
          multiple: true,
          value: resolved.link,
          onChange: (link) => setSearch({ link: listParam(link as LinkFilter[]) }),
        },
        {
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
          onChange: (project) =>
            setSearch({ project: listParam(project as (ProjectId | 'none')[]) }),
        },
      ]}
      onClear={() => setSearch(CLEAR_FILTERS)}
    />
  );
}

/** How the notes are drawn: Display (List or Cards, and the sort). */
export function NotesToolbarEnd({
  resolved,
  setSearch,
}: {
  resolved: ResolvedNotesSearch;
  setSearch: SetSearch;
}) {
  const compact = useWorkspaceShell().size === 'compact';
  return (
    <ListDisplay
      compact={compact}
      layout={{
        options: LAYOUTS,
        value: resolved.view,
        onChange: (view) => setSearch({ view }),
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
  );
}
