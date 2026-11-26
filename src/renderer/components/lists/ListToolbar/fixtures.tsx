/**
 * The list pages' toolbars for stories: the real `ListStatusChip`, `ListFilters` and `ListDisplay`
 * over sample choices, each holding its own state, so a screen story draws the toolbar the app
 * does and its controls work.
 */
import { useState } from 'react';
import { ProjectStatus, TaskPriority, TaskStatus } from '@common/types';
import {
  Calendar,
  CalendarDays,
  ChartNoAxesColumnIncreasing,
  Circle,
  CircleAlert,
  CircleCheck,
  CircleDashed,
  CircleSlash,
  Clock,
  Cloud,
  Folder,
  Kanban,
  LayoutGrid,
  Link,
  List,
  Plus,
  Type,
} from 'lucide-react';
import { PriorityIcon } from '../../entities/PriorityIcon';
import { ProjectGlyph } from '../../entities/ProjectPicker';
import { ProjectStatusIcon } from '../../entities/ProjectStatusIcon';
import { StatusIcon } from '../../entities/StatusIcon';
import {
  PRIORITY_LABELS,
  PROJECT_STATUS_LABELS,
  TASK_STATUS_LABELS,
  type Swatch,
} from '../../types';
import {
  ListDisplay,
  ListFilterChips,
  ListFilters,
  ListStatusChip,
  type ListFilterField,
  type ListToolbarOption,
} from './ListToolbar';

/** Which list page's toolbar a story draws. */
export type DemoList = 'tasks' | 'projects' | 'notes';

/** A field without its state: one that holds several values says so (`multiple`). */
type Field = Omit<ListFilterField, 'value' | 'onChange' | 'multiple'> & { multiple?: boolean };

const SOURCE: Field = {
  id: 'source',
  label: 'Source',
  icon: Cloud,
  options: [
    { value: 'local', label: 'Local', icon: Circle },
    { value: 'external', label: 'Synced', icon: Cloud },
  ],
};

const PROJECT_COLOURS: Record<string, Swatch> = {
  'Auth Overhaul': 'blue',
  'API Gateway v2': 'amber',
  'AI Action Items': 'green',
  'User Interface Revamp': 'indigo',
};

const projectField = (names: string[]): Field => ({
  id: 'project',
  multiple: true,
  label: 'Project',
  icon: Folder,
  search: 'Search projects…',
  options: [
    ...names.map((name) => ({
      value: name,
      label: name,
      icon: <ProjectGlyph color={PROJECT_COLOURS[name] ?? 'blue'} />,
    })),
    { value: 'none', label: 'No project', icon: CircleSlash },
  ],
});

const FIELDS: Record<DemoList, Field[]> = {
  tasks: [
    {
      id: 'priority',
      multiple: true,
      label: 'Priority',
      icon: ChartNoAxesColumnIncreasing,
      options: [TaskPriority.HIGH, TaskPriority.MEDIUM, TaskPriority.LOW, TaskPriority.NONE].map(
        (priority) => ({
          value: String(priority),
          label: PRIORITY_LABELS[priority],
          icon: <PriorityIcon priority={priority} />,
        }),
      ),
    },
    {
      id: 'due',
      label: 'Due',
      icon: Calendar,
      options: [
        { value: 'overdue', label: 'Overdue', icon: CircleAlert },
        { value: 'today', label: 'Today', icon: Calendar },
        { value: 'week', label: 'This week', icon: Calendar },
        { value: 'none', label: 'No due date', icon: CircleSlash },
      ],
    },
    SOURCE,
    projectField(['Auth Overhaul', 'API Gateway v2', 'AI Action Items', 'User Interface Revamp']),
  ],
  projects: [SOURCE],
  notes: [
    {
      id: 'link',
      multiple: true,
      label: 'Linked to',
      icon: Link,
      options: [
        { value: 'event', label: 'An event', icon: CalendarDays },
        { value: 'task', label: 'A task', icon: CircleCheck },
        { value: 'none', label: 'Nothing', icon: CircleSlash },
      ],
    },
    projectField(['Auth Overhaul', 'API Gateway v2']),
  ],
};

interface Statuses {
  scopes: ListToolbarOption[];
  statuses: ListToolbarOption[];
}

const STATUSES: Partial<Record<DemoList, Statuses>> = {
  tasks: {
    scopes: [
      { value: 'open', label: 'Open' },
      { value: 'all', label: 'All' },
    ],
    statuses: [
      TaskStatus.NOT_STARTED,
      TaskStatus.IN_PROGRESS,
      TaskStatus.COMPLETED,
      TaskStatus.CANCELLED,
    ].map((status) => ({
      value: String(status),
      label: TASK_STATUS_LABELS[status],
      icon: <StatusIcon status={status} />,
    })),
  },
  projects: {
    scopes: [
      { value: 'active', label: 'Active' },
      { value: 'all', label: 'All' },
    ],
    statuses: [ProjectStatus.NOT_STARTED, ProjectStatus.ON_HOLD, ProjectStatus.COMPLETED].map(
      (status) => ({
        value: String(status),
        label: PROJECT_STATUS_LABELS[status],
        icon: <ProjectStatusIcon status={status} />,
      }),
    ),
  },
};

export interface DemoToolbarStartProps {
  list: DemoList;
  compact?: boolean;
  /** the status the chip starts on; the list's default (Open, Active) otherwise */
  status?: string;
  /**
   * the filters set at first, by field id: `{ priority: [String(TaskPriority.HIGH)] }`, a list
   * for a field that holds several values
   */
  filters?: Record<string, string | string[]>;
  /** draws one of the menus open */
  open?: 'status' | 'filter';
  /** a project's Tasks tab: no Project filter */
  fixedProject?: boolean;
  /**
   * the alternative being tried: the chips go in a row of their own (`DemoFilterChips`, given this
   * same state) and the Filter button stays put
   */
  state?: DemoFilters;
}

type DemoValues = Record<string, string | string[] | undefined>;

/** A list's filters as a story holds them, for a toolbar and a chip row that share them. */
export interface DemoFilters {
  fields: ListFilterField[];
  clear: () => void;
}

/** The sample fields of `list`, holding their own state from `filters`. */
export function useDemoFilters(
  list: DemoList,
  filters: DemoValues = {},
  fixedProject?: boolean,
): DemoFilters {
  const [values, setValues] = useState<DemoValues>(filters);
  const fields = FIELDS[list]
    .filter((field) => !fixedProject || field.id !== 'project')
    .map(({ multiple, ...field }): ListFilterField => {
      const value = values[field.id];
      const onChange = (next: string | string[] | undefined) =>
        setValues((all) => ({ ...all, [field.id]: next }));
      return multiple
        ? { ...field, multiple: true, value: [value ?? []].flat(), onChange }
        : { ...field, value: [value].flat()[0], onChange };
    });
  return { fields, clear: () => setValues({}) };
}

/** The alternative's row of chips under the toolbar, over the state its toolbar was given. */
export function DemoFilterChips({ state }: { state: DemoFilters }) {
  return <ListFilterChips fields={state.fields} onClear={state.clear} />;
}

/** The start of a list page's toolbar: its Status chip, its filter chips and the Filter button. */
export function DemoToolbarStart({
  list,
  compact,
  status,
  filters = {},
  open,
  fixedProject,
  state,
}: DemoToolbarStartProps) {
  const statuses = STATUSES[list];
  const [scope, setScope] = useState(status ?? statuses?.scopes[0]?.value ?? '');
  const own = useDemoFilters(list, filters, fixedProject);
  const { fields, clear } = state ?? own;
  return (
    <>
      {statuses && (
        <ListStatusChip
          icon={CircleDashed}
          options={statuses.scopes}
          statuses={statuses.statuses}
          value={scope}
          active={scope !== statuses.scopes[0]?.value}
          compact={compact}
          defaultOpen={open === 'status'}
          onChange={setScope}
        />
      )}
      <ListFilters
        compact={compact}
        defaultOpen={open === 'filter'}
        chips={state ? 'row' : 'inline'}
        fields={fields}
        onClear={clear}
      />
    </>
  );
}

const SORTS: Record<DemoList, ListToolbarOption[]> = {
  tasks: [
    { value: 'priority', label: 'Priority', icon: ChartNoAxesColumnIncreasing },
    { value: 'due_date', label: 'Due date', icon: Calendar },
    { value: 'status', label: 'Status', icon: Circle },
    { value: 'updated_at', label: 'Last updated', icon: Clock },
    { value: 'created_at', label: 'Created', icon: Plus },
  ],
  projects: [
    { value: 'due_date', label: 'Due date', icon: Calendar },
    { value: 'status', label: 'Status', icon: Circle },
    { value: 'updated_at', label: 'Last updated', icon: Clock },
    { value: 'created_at', label: 'Created', icon: Plus },
  ],
  notes: [
    { value: 'updated_at', label: 'Last edited', icon: Clock },
    { value: 'created_at', label: 'Created', icon: Plus },
    { value: 'title', label: 'Title', icon: Type },
  ],
};

const GROUP_BYS: ListToolbarOption[] = [
  { value: 'none', label: 'None', icon: CircleSlash },
  { value: 'project', label: 'Project', icon: Folder },
  { value: 'status', label: 'Status', icon: Circle },
  { value: 'priority', label: 'Priority', icon: ChartNoAxesColumnIncreasing },
  { value: 'due', label: 'Due date', icon: Calendar },
];

const LIST: ListToolbarOption = { value: 'list', label: 'List', icon: List };
const LAYOUTS: Record<DemoList, ListToolbarOption[]> = {
  tasks: [LIST, { value: 'board', label: 'Board', icon: Kanban }],
  projects: [LIST, { value: 'cards', label: 'Cards', icon: LayoutGrid }],
  notes: [LIST, { value: 'cards', label: 'Cards', icon: LayoutGrid }],
};

export interface DemoToolbarEndProps {
  list: DemoList;
  compact?: boolean;
  /** `list` at first; `board` for tasks, `cards` for projects and notes */
  layout?: string;
  /** the tasks list's grouping at first; none otherwise */
  groupBy?: string;
  /** draws Display open */
  open?: boolean;
}

/** The end of a list page's toolbar: Display. */
export function DemoToolbarEnd({
  list,
  compact,
  layout: initialLayout = 'list',
  groupBy: initialGroupBy = 'none',
  open,
}: DemoToolbarEndProps) {
  const [layout, setLayout] = useState(initialLayout);
  const [groupBy, setGroupBy] = useState(initialGroupBy);
  const [sort, setSort] = useState(SORTS[list][0]!.value);
  const [dir, setDir] = useState<'asc' | 'desc'>(list === 'projects' ? 'asc' : 'desc');
  const board = layout === 'board';
  return (
    <ListDisplay
      compact={compact}
      defaultOpen={open}
      layout={{ options: LAYOUTS[list], value: layout, onChange: setLayout }}
      groupBy={
        list === 'tasks' && !board
          ? { options: GROUP_BYS, value: groupBy, onChange: setGroupBy }
          : undefined
      }
      sort={
        board
          ? undefined
          : { options: SORTS[list], value: sort, onChange: setSort, dir, onDirChange: setDir }
      }
      note={board ? 'The board groups tasks by status.' : undefined}
    />
  );
}
