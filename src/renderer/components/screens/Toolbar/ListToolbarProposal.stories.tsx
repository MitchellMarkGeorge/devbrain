import { useState } from 'react';
import { ProjectStatus, TaskPriority, TaskStatus } from '@common/types';
import type { Meta, StoryObj } from '@storybook/react-vite';
import {
  Calendar,
  CalendarDays,
  ChartNoAxesColumnIncreasing,
  Circle,
  CircleAlert,
  CircleCheck,
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
import { Board, BoardColumn } from '../../board/BoardColumn';
import { PriorityIcon } from '../../entities/PriorityIcon';
import { ProjectStatusIcon } from '../../entities/ProjectStatusIcon';
import { StatusIcon } from '../../entities/StatusIcon';
import { STORY_NOW } from '../../lib/story-dates';
import { GroupHeading } from '../../lists/GroupHeading';
import { TaskList } from '../../lists/TaskList';
import type { TaskRowData } from '../../lists/TaskRow';
import { NoteCard } from '../../notes/NoteCard';
import { CardGrid } from '../../shell/CardGrid';
import { PageContent, PageToolbar } from '../../shell/Page';
import { ProjectCard } from '../../projects/ProjectCard';
import { SAMPLE_PROJECTS } from '../../projects/ProjectCard/fixtures';
import {
  PRIORITY_LABELS,
  PROJECT_STATUSES,
  PROJECT_STATUS_LABELS,
  TASK_STATUS_LABELS,
  isClosed,
} from '../../types';
import { NOTES } from '../Notes/data';
import { BOARD, LIST_TASKS } from '../Tasks/data';
import { ScreenFrame, type PageName } from '../Shell/AppFrame';
import {
  ListToolbarEnd,
  ListToolbarStart,
  type ListToolbarDef,
  type ListToolbarState,
  type ScopeStyle,
} from './ListToolbarMock';

/*
 * A proposal for the list pages' toolbar (not in Figma, not in the app): the same toolbar on
 * Tasks, Projects and Notes, each page giving it only its definition. The stories work: the scope,
 * the chips, the filter menu and Display all change the page under them.
 */

const meta = {
  title: 'Screens/Toolbar/Proposal',
  parameters: { layout: 'fullscreen' },
} satisfies Meta;

export default meta;
type Story = StoryObj<typeof meta>;

/** The window as the app draws it: the title bar with the page's title, the toolbar, the page. */
function Frame({
  page,
  toolbar,
  children,
}: {
  page: PageName;
  toolbar: React.ComponentProps<typeof ListToolbarStart>;
  children: React.ReactNode;
}) {
  return (
    <ScreenFrame
      page={page}
      title={page}
      width={toolbar.compact ? 960 : 1440}
      height={toolbar.compact ? 640 : 1024}
    >
      <PageToolbar
        start={<ListToolbarStart {...toolbar} />}
        end={<ListToolbarEnd {...toolbar} />}
      />
      <PageContent layout="list">{children}</PageContent>
    </ScreenFrame>
  );
}

const SOURCE_FIELD = {
  id: 'source',
  label: 'Source',
  icon: Cloud,
  options: [
    { value: 'local', label: 'Local', icon: Circle },
    { value: 'synced', label: 'Synced', icon: Cloud },
  ],
};

// ---------- Tasks ----------

const PROJECT_NAMES = [
  'Auth Overhaul',
  'API Gateway v2',
  'AI Action Items',
  'User Interface Revamp',
];

const TASKS_DEF: ListToolbarDef = {
  scopes: [
    { value: 'open', label: 'Open' },
    { value: 'all', label: 'All' },
    { value: 'done', label: 'Done' },
  ],
  scopeAll: 'all',
  scopeMore: [
    TaskStatus.NOT_STARTED,
    TaskStatus.IN_PROGRESS,
    TaskStatus.COMPLETED,
    TaskStatus.CANCELLED,
  ].map((status) => ({
    value: `status-${status}`,
    label: TASK_STATUS_LABELS[status],
    icon: <StatusIcon status={status} />,
  })),
  fields: [
    {
      id: 'priority',
      label: 'Priority',
      icon: ChartNoAxesColumnIncreasing,
      options: [TaskPriority.HIGH, TaskPriority.MEDIUM, TaskPriority.LOW].map((priority) => ({
        value: String(priority),
        label: PRIORITY_LABELS[priority],
        icon: <PriorityIcon priority={priority} />,
      })),
    },
    {
      id: 'project',
      label: 'Project',
      icon: Folder,
      options: [
        ...PROJECT_NAMES.map((name) => ({ value: name, label: name, icon: Folder })),
        { value: '', label: 'No project', icon: CircleSlash },
      ],
    },
    {
      id: 'due',
      label: 'Due',
      icon: Calendar,
      options: [
        { value: 'overdue', label: 'Overdue', icon: CircleAlert },
        { value: 'week', label: 'This week', icon: Calendar },
        { value: 'none', label: 'No due date', icon: CircleSlash },
      ],
    },
    SOURCE_FIELD,
  ],
  sorts: [
    { value: 'priority', label: 'Priority', icon: ChartNoAxesColumnIncreasing },
    { value: 'due', label: 'Due date', icon: Calendar },
    { value: 'title', label: 'Title', icon: Type },
  ],
  groupBys: [
    { value: 'none', label: 'None', icon: CircleSlash },
    { value: 'project', label: 'Project', icon: Folder },
    { value: 'status', label: 'Status', icon: Circle },
    { value: 'priority', label: 'Priority', icon: ChartNoAxesColumnIncreasing },
  ],
  layouts: [
    { value: 'list', label: 'List', icon: List },
    { value: 'board', label: 'Board', icon: Kanban },
  ],
  fixedLayout: 'board',
};

// the open tasks of the list screen, and the board screen's completed ones
const ALL_TASKS: TaskRowData[] = [
  ...LIST_TASKS.map((task) => ({ ...task, depth: 0, parentTask: null })),
  ...BOARD.completed.filter((done) => !LIST_TASKS.some((task) => task.title === done.title)),
];

const DAY = 24 * 60 * 60 * 1000;

function dueBucket(task: TaskRowData): string {
  if (!task.dueDate) return 'none';
  const days = (task.dueDate.getTime() - STORY_NOW.getTime()) / DAY;
  if (days < 0 && !isClosed(task.status)) return 'overdue';
  return days < 7 ? 'week' : 'later';
}

function shownTasks(state: ListToolbarState): TaskRowData[] {
  const picked = (field: string, value: string) => {
    const values = state.filters[field] ?? [];
    return values.length === 0 || values.includes(value);
  };
  const tasks = ALL_TASKS.filter(
    (task) =>
      (state.scope.startsWith('status-')
        ? state.scope === `status-${task.status}`
        : state.scope === 'all' || (state.scope === 'done') === isClosed(task.status)) &&
      picked('priority', String(task.priority)) &&
      picked('project', task.project?.title ?? '') &&
      picked('due', dueBucket(task)) &&
      picked('source', task.external ? 'synced' : 'local'),
  );
  const order = (a: TaskRowData, b: TaskRowData) => {
    if (state.sort === 'title') return a.title.localeCompare(b.title);
    if (state.sort === 'due')
      return (a.dueDate?.getTime() ?? Infinity) - (b.dueDate?.getTime() ?? Infinity);
    return a.priority - b.priority;
  };
  return tasks.sort((a, b) => (state.dir === 'asc' ? order(a, b) : order(b, a)));
}

function groupsOf(tasks: TaskRowData[], groupBy: string) {
  const groups = new Map<string, { heading: React.ReactNode; tasks: TaskRowData[] }>();
  for (const task of tasks) {
    const key =
      groupBy === 'project'
        ? (task.project?.title ?? 'No project')
        : groupBy === 'status'
          ? TASK_STATUS_LABELS[task.status]
          : PRIORITY_LABELS[task.priority];
    if (!groups.has(key)) groups.set(key, { heading: null, tasks: [] });
    groups.get(key)!.tasks.push(groupBy === 'project' ? { ...task, project: null } : task);
  }
  return [...groups].map(([label, group]) => {
    const first = tasks.find((task) => group.tasks.some((t) => t.id === task.id))!;
    return {
      id: label,
      tasks: group.tasks,
      heading: (
        <GroupHeading
          label={label}
          count={group.tasks.length}
          icon={
            groupBy === 'project' ? (
              Folder
            ) : groupBy === 'status' ? (
              <StatusIcon status={first.status} />
            ) : (
              <PriorityIcon priority={first.priority} />
            )
          }
          color={groupBy === 'project' ? (first.project?.color ?? undefined) : undefined}
          onCollapsedChange={() => {}}
        />
      ),
    };
  });
}

function TasksPage({
  compact = false,
  initial,
}: {
  compact?: boolean;
  initial?: Partial<ListToolbarState>;
}) {
  const [state, setState] = useState<ListToolbarState>({
    scope: 'open',
    filters: {},
    sort: 'priority',
    dir: 'desc',
    groupBy: 'none',
    layout: 'list',
    ...initial,
  });
  const onChange = (patch: Partial<ListToolbarState>) => setState((s) => ({ ...s, ...patch }));
  const tasks = shownTasks(state);
  const column = (status: TaskStatus) => tasks.filter((task) => task.status === status);
  const toolbar = { def: TASKS_DEF, state, onChange, compact };
  return (
    <Frame page="Tasks" toolbar={toolbar}>
      {state.layout === 'board' ? (
        <Board>
          <BoardColumn status={TaskStatus.NOT_STARTED} tasks={column(TaskStatus.NOT_STARTED)} />
          <BoardColumn status={TaskStatus.IN_PROGRESS} tasks={column(TaskStatus.IN_PROGRESS)} />
          <BoardColumn
            status={TaskStatus.COMPLETED}
            tasks={column(TaskStatus.COMPLETED)}
            add={false}
          />
        </Board>
      ) : state.groupBy === 'none' ? (
        <TaskList tasks={tasks} selectionBar={false} />
      ) : (
        <TaskList groups={groupsOf(tasks, state.groupBy)} selectionBar={false} />
      )}
    </Frame>
  );
}

/** Nothing filtered: the Status chip, a quiet "+ Filter", and Display at the end. */
export const Tasks: Story = { render: () => <TasksPage /> };

/** Two filters set, one with two values, grouped by project: each filter is a chip with its own ×. */
export const TasksFiltered: Story = {
  name: 'Tasks — filtered and grouped',
  render: () => (
    <TasksPage
      initial={{
        filters: {
          priority: [String(TaskPriority.HIGH), String(TaskPriority.MEDIUM)],
          source: ['synced'],
        },
        groupBy: 'project',
      }}
    />
  ),
};

/** The board orders and groups itself: the toolbar keeps its shape, and Display names the layout. */
export const TasksBoard: Story = {
  name: 'Tasks — board',
  render: () => <TasksPage initial={{ scope: 'all', layout: 'board' }} />,
};

/** A narrow window: Status and Display drop their values, and the chips fold into "Filter 2". */
export const TasksCompact: Story = {
  name: 'Tasks — compact window',
  render: () => (
    <TasksPage
      compact
      initial={{ filters: { priority: [String(TaskPriority.HIGH)], source: ['synced'] } }}
    />
  ),
};

/** The same, on the light theme. */
export const TasksFilteredLight: Story = {
  ...TasksFiltered,
  name: 'Tasks — filtered and grouped, light',
  globals: { theme: 'light' },
};

// ---------- Projects and Notes ----------

const PROJECTS_DEF: ListToolbarDef = {
  scopes: [
    { value: 'active', label: 'Active' },
    { value: 'all', label: 'All' },
    { value: 'done', label: 'Done' },
  ],
  scopeAll: 'all',
  scopeMore: PROJECT_STATUSES.map((status) => ({
    value: `status-${status}`,
    label: PROJECT_STATUS_LABELS[status],
    icon: <ProjectStatusIcon status={status} />,
  })),
  fields: [SOURCE_FIELD],
  sorts: [
    { value: 'due', label: 'Due date', icon: Calendar },
    { value: 'status', label: 'Status', icon: Circle },
    { value: 'updated', label: 'Last updated', icon: Clock },
    { value: 'created', label: 'Created', icon: Plus },
  ],
  layouts: [
    { value: 'list', label: 'List', icon: List },
    { value: 'cards', label: 'Cards', icon: LayoutGrid },
  ],
};

/** Projects: the same toolbar with a shorter definition (one filter, no grouping). */
export const Projects: Story = {
  render: function ProjectsStory() {
    const [state, setState] = useState<ListToolbarState>({
      scope: 'active',
      filters: {},
      sort: 'due',
      dir: 'asc',
      groupBy: 'none',
      layout: 'cards',
    });
    const toolbar = {
      def: PROJECTS_DEF,
      state,
      onChange: (patch: Partial<ListToolbarState>) => setState((s) => ({ ...s, ...patch })),
    };
    const projects = SAMPLE_PROJECTS.filter(({ project }) =>
      state.scope.startsWith('status-')
        ? state.scope === `status-${project.status}`
        : state.scope === 'all' ||
          (state.scope === 'done') === (project.status === ProjectStatus.COMPLETED),
    );
    return (
      <Frame page="Projects" toolbar={toolbar}>
        <CardGrid gap="md">
          {projects.map(({ project, stats }) => (
            <ProjectCard key={project.title} project={project} stats={stats} />
          ))}
        </CardGrid>
      </Frame>
    );
  },
};

const NOTES_DEF: ListToolbarDef = {
  fields: [
    {
      id: 'project',
      label: 'Project',
      icon: Folder,
      options: [
        { value: 'Auth Overhaul', label: 'Auth Overhaul', icon: Folder },
        { value: 'API Gateway v2', label: 'API Gateway v2', icon: Folder },
        { value: '', label: 'No project', icon: CircleSlash },
      ],
    },
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
  ],
  sorts: [
    { value: 'updated', label: 'Last edited', icon: Clock },
    { value: 'created', label: 'Created', icon: Plus },
    { value: 'title', label: 'Title', icon: Type },
  ],
  layouts: [
    { value: 'list', label: 'List', icon: List },
    { value: 'cards', label: 'Cards', icon: LayoutGrid },
  ],
};

/** Notes have no status, so no scope: the row starts with the chips. */
export const Notes: Story = {
  render: function NotesStory() {
    const [state, setState] = useState<ListToolbarState>({
      scope: '',
      filters: { project: ['Auth Overhaul'] },
      sort: 'updated',
      dir: 'desc',
      groupBy: 'none',
      layout: 'cards',
    });
    const toolbar = {
      def: NOTES_DEF,
      state,
      onChange: (patch: Partial<ListToolbarState>) => setState((s) => ({ ...s, ...patch })),
    };
    const picked = (field: string, value: string) => {
      const values = state.filters[field] ?? [];
      return values.length === 0 || values.includes(value);
    };
    const notes = NOTES.filter(
      (note) =>
        picked('project', note.project?.title ?? '') && picked('link', note.link?.type ?? 'none'),
    );
    return (
      <Frame page="Notes" toolbar={toolbar}>
        <CardGrid gap="md">
          {notes.map((note) => (
            <NoteCard key={note.title} note={note} />
          ))}
        </CardGrid>
      </Frame>
    );
  },
};

// ---------- The status scope, four ways ----------

const SCOPE_STYLES: { style: ScopeStyle; title: string; note: string }[] = [
  {
    style: 'chip',
    title: 'A Status chip that is always there',
    note: 'Reads like the other chips. Its menu has Open, All and Done, then each status alone.',
  },
  {
    style: 'tabs',
    title: 'Text tabs',
    note: 'One click, as the segmented control was, without a second boxed control in the row.',
  },
  {
    style: 'display',
    title: 'A "Show completed" switch in Display',
    note: 'Nothing in the row: the list is open tasks unless the switch is on.',
  },
  {
    style: 'segmented',
    title: 'The segmented control (first draft)',
    note: 'For comparison.',
  },
];

function ScopeRow({ scopeStyle }: { scopeStyle: ScopeStyle }) {
  const [state, setState] = useState<ListToolbarState>({
    scope: 'open',
    filters: { priority: [String(TaskPriority.HIGH)] },
    sort: 'priority',
    dir: 'desc',
    groupBy: 'none',
    layout: 'list',
  });
  const toolbar = {
    def: TASKS_DEF,
    state,
    onChange: (patch: Partial<ListToolbarState>) => setState((s) => ({ ...s, ...patch })),
    scopeStyle,
  };
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      <ListToolbarStart {...toolbar} />
      <span style={{ flex: 1 }} />
      <ListToolbarEnd {...toolbar} />
    </div>
  );
}

/** The same toolbar with the status scope drawn each way; every row works. */
export const ScopeAlternatives: Story = {
  name: 'Status scope — alternatives',
  render: () => (
    <div
      style={{
        display: 'grid',
        gap: 28,
        width: 920,
        padding: 32,
        background: 'var(--background)',
        color: 'var(--foreground)',
        font: 'var(--font-weight-normal) 13px / var(--text-sm-leading) var(--font-sans)',
      }}
    >
      {SCOPE_STYLES.map(({ style, title, note }) => (
        <div key={style} style={{ display: 'grid', gap: 10 }}>
          <div>
            <span style={{ fontWeight: 'var(--font-weight-medium)' }}>{title}</span>
            <span style={{ color: 'var(--muted-foreground)' }}> · {note}</span>
          </div>
          <ScopeRow scopeStyle={style} />
        </div>
      ))}
    </div>
  ),
};
