import { useMemo, useRef, useState, type ComponentType, type ReactNode } from 'react';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { Calendar, CircleAlert, Folder } from 'lucide-react';
import { DropdownMenuItem, DropdownMenuSeparator } from '../../ui/DropdownMenu';
import { EventRow } from '../EventRow';
import { GroupHeading } from '../GroupHeading';
import { StatusIcon } from '../../entities/StatusIcon';
import { TaskStatus } from '@common/types';
import { storyDate } from '../../lib/story-dates';
import { BUSY_TASK, manyTasks, SAMPLE_SUBTASKS, SAMPLE_TASKS } from '../TaskRow/fixtures';
import { Text } from '../../layout/Text';
import { defaultKeymap, KeyboardProvider, KeyScope, useListCommands } from '@renderer/keyboard';
import {
  TaskList as TaskListComponent,
  type FlatTaskListProps,
  type TaskListBaseProps,
  type TaskListGroup,
  type TaskListHandle,
  type TaskListProps,
} from './TaskList';

/**
 * The list as the app mounts it: in a `list` key scope, driven by the default keymap's list
 * commands (↑/↓, Home/End, X, Esc, S, 1–3, ↵, F, ⌘⌫), which log what the page would do.
 */
function TaskList(props: TaskListProps) {
  const ref = useRef<TaskListHandle>(null);
  const log = (what: string) => (tasks: { title: string }[]) =>
    console.info(
      what,
      tasks.map((task) => task.title),
    );
  useListCommands(ref, {
    open: (task) => log('open')([task]),
    setStatus: (tasks, status) => log(`status ${status}`)(tasks),
    toggleFavorite: log('favorite'),
    trash: log('trash'),
  });
  return (
    <KeyScope name="list">
      <TaskListComponent ref={ref} {...props} />
    </KeyScope>
  );
}

const meta = {
  title: 'Lists/TaskList',
  component: TaskListComponent as ComponentType<TaskListBaseProps & FlatTaskListProps>,
  args: { tasks: SAMPLE_TASKS },
  render: (args) => <TaskList {...args} />,
  decorators: [
    (Story) => (
      <KeyboardProvider keymap={defaultKeymap}>
        <div style={{ maxWidth: 900 }}>
          <Story />
        </div>
      </KeyboardProvider>
    ),
  ],
  // the stories' controls are a flat list's; the grouped stories render their own
} satisfies Meta<TaskListBaseProps & FlatTaskListProps>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

/** Neighbouring selected rows join into one block; the bar floats over the bottom. */
export const Selection: Story = {
  args: {
    defaultSelected: ['tsk_calendar_sync', 'tsk_release_notes', 'tsk_migrations'],
    floatingBar: false,
    selectionMenu: (
      <>
        <DropdownMenuItem icon={Folder}>Move to project</DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem variant="destructive">Move to trash</DropdownMenuItem>
      </>
    ),
  },
};

export const StatusMenuOpen: Story = {
  args: { menuOpenAt: 1 },
};

export const Subtasks: Story = {
  args: { tasks: SAMPLE_SUBTASKS, subtasks: true },
};

/** A narrow list: each row stacks its own pills as far as it needs to */
export const NarrowStacked: Story = {
  args: { tasks: [BUSY_TASK, ...SAMPLE_TASKS.slice(0, 2)] },
  decorators: [
    (Story) => (
      <div style={{ maxWidth: 720 }}>
        <Story />
      </div>
    ),
  ],
};

/**
 * The grouped list: headings and rows in one virtualized list, the current group's heading stuck
 * to the top. Collapse a group with its chevron: its rows leave the list. The event under its
 * heading is part of the heading's row.
 */
export const Grouped: Story = {
  render: function Grouped() {
    const [collapsed, setCollapsed] = useState<Record<string, boolean>>({ later: true });
    const toggle = (id: string) => (value: boolean) =>
      setCollapsed((current) => ({ ...current, [id]: value }));
    const groups: TaskListGroup[] = [
      {
        id: 'overdue',
        collapsed: collapsed.overdue,
        heading: (
          <GroupHeading
            label="Overdue"
            icon={CircleAlert}
            color="var(--status-overdue)"
            count={2}
            collapsed={collapsed.overdue}
            onCollapsedChange={toggle('overdue')}
          />
        ),
        tasks: [SAMPLE_TASKS[1], { ...SAMPLE_TASKS[2], dueDate: storyDate(-1) }],
      },
      {
        id: 'event',
        collapsed: collapsed.event,
        heading: (
          <>
            <GroupHeading
              label="Mitchell / Jesse 1:1"
              subtitle="Today, 10:00 AM"
              bar="indigo"
              count={3}
              collapsed={collapsed.event}
              onCollapsedChange={toggle('event')}
            />
            {!collapsed.event && (
              <EventRow
                event={{
                  title: 'Mitchell / Jesse 1:1',
                  startAt: storyDate(0, 10),
                  endAt: storyDate(0, 10, 30),
                  allDay: false,
                  recurrenceRule: 'RRULE:FREQ=WEEKLY;BYDAY=MO',
                  meetingUrl: 'https://meet.google.com/abc-defg-hij',
                  color: 'indigo',
                }}
              />
            )}
          </>
        ),
        tasks: [SAMPLE_TASKS[0], SAMPLE_TASKS[4]],
      },
      {
        id: 'in-progress',
        collapsed: collapsed['in-progress'],
        heading: (
          <GroupHeading
            label="In progress"
            icon={<StatusIcon status={TaskStatus.IN_PROGRESS} size={14} />}
            color="var(--status-in-progress)"
            count={5}
            collapsed={collapsed['in-progress']}
            onCollapsedChange={toggle('in-progress')}
          />
        ),
        tasks: [SAMPLE_TASKS[3]],
      },
      {
        id: 'later',
        collapsed: collapsed.later,
        heading: (
          <GroupHeading
            label="Later"
            icon={Calendar}
            count={8}
            collapsed={collapsed.later}
            onCollapsedChange={toggle('later')}
          />
        ),
        tasks: manyTasks(8),
      },
    ];
    return <TaskList groups={groups} />;
  },
};

const PAGE = 100;
const TOTAL = 1000;

/**
 * A page's content area as the app lays it out: a fixed header, then the list filling the rest of
 * the height and scrolling on its own.
 */
function Page({ header, children }: { header: ReactNode; children: ReactNode }) {
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        height: 560,
        border: '1px dashed var(--border)',
        borderRadius: 8,
      }}
    >
      <div style={{ flex: 'none', padding: '12px 12px 12px 36px' }}>{header}</div>
      {children}
    </div>
  );
}

/**
 * 1,000 tasks, loaded 100 at a time as `onEndReached` fires near the last loaded rows (as
 * `fetchNextPage` will): only the rows in view are in the DOM. `aria-rowcount` is the 1,000 a
 * count gives; each drawn row has its `aria-rowindex`. ↓ and End (the keymap's list commands)
 * scroll the focused row into view before focusing it. The list scrolls on its own under the page's header.
 */
export const ThousandRows: Story = {
  name: '1,000 rows',
  render: function ThousandRows() {
    const [loaded, setLoaded] = useState(() => manyTasks(PAGE));
    return (
      <Page
        header={
          <Text size="xs" tone="subtle">
            {loaded.length} of {TOTAL} loaded
          </Text>
        }
      >
        <TaskList
          tasks={loaded}
          rowCount={TOTAL}
          onEndReached={() =>
            setLoaded((rows) =>
              rows.length >= TOTAL ? rows : [...rows, ...manyTasks(PAGE, rows.length)],
            )
          }
        />
      </Page>
    );
  },
};

/** 1,000 tasks in ten groups of 100: the current heading sticks to the top of the list as it scrolls. */
export const ThousandRowsGrouped: Story = {
  name: '1,000 rows, grouped',
  render: function ThousandRowsGrouped() {
    const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
    const all = useMemo(() => manyTasks(TOTAL), []);
    const groups: TaskListGroup[] = Array.from({ length: 10 }, (_, g) => ({
      id: `group-${g}`,
      collapsed: collapsed[g],
      heading: (
        <GroupHeading
          label={`Group ${g + 1}`}
          icon={Calendar}
          count={100}
          collapsed={collapsed[g]}
          onCollapsedChange={(value) => setCollapsed((current) => ({ ...current, [g]: value }))}
        />
      ),
      tasks: all.slice(g * 100, g * 100 + 100),
    }));
    return (
      <Page
        header={
          <Text size="xs" tone="subtle">
            Ten groups of 100
          </Text>
        }
      >
        <TaskList groups={groups} />
      </Page>
    );
  },
};
