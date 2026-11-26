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
  ListFilters,
  ListStatusChip,
  type ListFilterField,
  type ListToolbarOption,
} from './ListToolbar';

/** Which list page's toolbar a story draws. */
export type DemoList = 'tasks' | 'projects' | 'notes';

type Field = Omit<ListFilterField, 'value' | 'onChange'>;

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
  /** the window's size, for how many chips are drawn; from `compact` otherwise */
  size?: 'compact' | 'medium' | 'wide';
  /** the status the chip starts on; the list's default (Open, Active) otherwise */
  status?: string;
  /** the filters set at first, by field id: `{ priority: String(TaskPriority.HIGH) }` */
  filters?: Record<string, string>;
  /** draws one of the menus open */
  open?: 'status' | 'filter';
  /** a project's Tasks tab: no Project filter */
  fixedProject?: boolean;
}

/** The start of a list page's toolbar: its Status chip, its filter chips and "+ Filter". */
export function DemoToolbarStart({
  list,
  compact,
  size,
  status,
  filters = {},
  open,
  fixedProject,
}: DemoToolbarStartProps) {
  const statuses = STATUSES[list];
  const [scope, setScope] = useState(status ?? statuses?.scopes[0]?.value ?? '');
  const [values, setValues] = useState<Record<string, string | undefined>>(filters);
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
        size={size ?? (compact ? 'compact' : 'wide')}
        defaultOpen={open === 'filter'}
        fields={FIELDS[list]
          .filter((field) => !fixedProject || field.id !== 'project')
          .map((field) => ({
            ...field,
            value: values[field.id],
            onChange: (value) => setValues((all) => ({ ...all, [field.id]: value })),
          }))}
        onClear={() => setValues({})}
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
