import {
  Calendar,
  CalendarDays,
  CircleCheck,
  CircleSlash,
  Clock,
  Folder,
  LayoutGrid,
  ListChecks,
  PencilLine,
  List,
  Shapes,
  Plus,
  Type,
  type LucideIcon,
} from 'lucide-react';
import type { ProjectId } from '@common/ids';
import { listParam } from '@renderer/shared/lib/search-params';
import {
  ListDisplay,
  ListFilterButton,
  ListFilters,
  ListStatusChip,
  type ListFilterField,
  ProjectGlyph,
  useWorkspaceShell,
  type ListToolbarOption,
} from '@renderer/components';
import { useProjectOptions } from '@renderer/features/tasks/hooks/use-project-options';
import {
  CLEAR_FILTERS,
  EDITED_FILTERS,
  NOTE_SORTS,
  type EditedFilter,
  type TasksFilter,
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

/** A note's type, by what it is linked to: nothing, a task, or an event. */
export const LINK_LABELS: Record<LinkFilter, string> = {
  none: 'Standalone',
  task: 'Task notes',
  event: 'Event notes',
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

export const EDITED_LABELS: Record<EditedFilter, string> = {
  today: 'Today',
  week: 'Past 7 days',
  month: 'Past 30 days',
  older: 'Older',
};

type TypeFilter = LinkFilter | 'all';

const TYPE_SCOPES: ListToolbarOption<TypeFilter>[] = [{ value: 'all', label: 'All' }];
// standalone first: the notes that are no task's or event's
const TYPE_OPTIONS: ListToolbarOption<TypeFilter>[] = (['none', 'task', 'event'] as const).map(
  (link) => ({ value: link, label: LINK_LABELS[link], icon: LINK_ICONS[link] }),
);

/**
 * The fields the notes can be filtered by, with what the URL filters them to: when the note was
 * last edited, whether tasks were made from it, and its project. The project holds several
 * values, the others one. The chips (`NotesToolbarStart`) and the Filter button
 * (`NotesToolbarEnd`) both draw them. A note's type is not one of the filters: the Type chip
 * sets it.
 */
function useNoteFilterFields(
  resolved: ResolvedNotesSearch,
  setSearch: SetSearch,
): { fields: ListFilterField[]; clear: () => void } {
  const projects = useProjectOptions();
  const fields: ListFilterField[] = [
    {
      id: 'edited',
      label: 'Edited',
      icon: PencilLine,
      options: EDITED_FILTERS.map((edited) => ({
        value: edited,
        label: EDITED_LABELS[edited],
        icon: Calendar,
      })),
      value: resolved.edited,
      onChange: (edited) => setSearch({ edited: edited as EditedFilter | undefined }),
    },
    {
      id: 'tasks',
      label: 'Has tasks',
      icon: ListChecks,
      options: [
        { value: 'with', label: 'Yes', icon: CircleCheck },
        { value: 'without', label: 'No', icon: CircleSlash },
      ],
      value: resolved.tasks,
      onChange: (tasks) => setSearch({ tasks: tasks as TasksFilter | undefined }),
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
      onChange: (project) => setSearch({ project: listParam(project as (ProjectId | 'none')[]) }),
    },
  ];
  // the Type chip is not one of the filters: it keeps what the URL says
  return { fields, clear: () => setSearch({ ...CLEAR_FILTERS, link: resolved.link }) };
}

/**
 * Which notes are shown: the Type chip (All by default; or the standalone notes, the task notes or
 * the event notes alone), where the other lists have Status, then a chip per filter that is set.
 */
export function NotesToolbarStart({
  resolved,
  setSearch,
}: {
  resolved: ResolvedNotesSearch;
  setSearch: SetSearch;
}) {
  const compact = useWorkspaceShell().size === 'compact';
  const { fields, clear } = useNoteFilterFields(resolved, setSearch);
  return (
    <>
      <ListStatusChip<TypeFilter>
        label="Type"
        icon={Shapes}
        options={TYPE_SCOPES}
        statuses={TYPE_OPTIONS}
        value={resolved.link ?? 'all'}
        active={resolved.link !== undefined}
        compact={compact}
        // All is the default, so it leaves the URL
        onChange={(type) => setSearch({ link: type === 'all' ? undefined : type })}
      />
      <ListFilters fields={fields} onClear={clear} />
    </>
  );
}

/** The Filter button, then how the notes are drawn: Display (List or Cards, and the sort). */
export function NotesToolbarEnd({
  resolved,
  setSearch,
}: {
  resolved: ResolvedNotesSearch;
  setSearch: SetSearch;
}) {
  const compact = useWorkspaceShell().size === 'compact';
  const { fields, clear } = useNoteFilterFields(resolved, setSearch);
  return (
    <>
      <ListFilterButton fields={fields} onClear={clear} />
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
    </>
  );
}
