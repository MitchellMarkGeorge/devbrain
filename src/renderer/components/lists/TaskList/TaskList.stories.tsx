import { useMemo, useState } from 'react';
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
import { TaskList, type TaskListGroup } from './TaskList';

const meta = {
  title: 'Lists/TaskList',
  component: TaskList,
  args: { tasks: SAMPLE_TASKS },
  decorators: [
    (Story) => (
      <div style={{ maxWidth: 900 }}>
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof TaskList>;

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
            subtitle="Oldest due Jun 19"
            icon={CircleAlert}
            iconColor="var(--status-overdue)"
            tint="var(--status-overdue-tint)"
            done={0}
            total={2}
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
              subtitle="Event · Today, 10:00 AM"
              bar="indigo"
              done={1}
              total={3}
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
            subtitle="Started this week"
            icon={<StatusIcon status={TaskStatus.IN_PROGRESS} />}
            tint="var(--status-in-progress-tint)"
            done={2}
            total={5}
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
            subtitle="Due next month"
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
 * 1,000 tasks, loaded 100 at a time as `onEndReached` fires near the last loaded rows (as
 * `fetchNextPage` will): only the rows in view are in the DOM. `aria-rowcount` is the 1,000 a
 * count gives; each drawn row has its `aria-rowindex`. ↓ and End scroll the focused row into
 * view before focusing it.
 */
export const ThousandRows: Story = {
  name: '1,000 rows',
  render: function ThousandRows() {
    const [loaded, setLoaded] = useState(() => manyTasks(PAGE));
    return (
      <>
        <Text size="xs" tone="subtle" style={{ padding: '0 0 8px 36px' }}>
          {loaded.length} of {TOTAL} loaded
        </Text>
        <TaskList
          tasks={loaded}
          rowCount={TOTAL}
          onEndReached={() =>
            setLoaded((rows) =>
              rows.length >= TOTAL ? rows : [...rows, ...manyTasks(PAGE, rows.length)],
            )
          }
        />
      </>
    );
  },
};

/** 1,000 tasks in ten groups of 100: the current heading sticks as the list scrolls. */
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
          subtitle={`Tasks ${g * 100 + 1}–${g * 100 + 100}`}
          icon={Calendar}
          count={100}
          collapsed={collapsed[g]}
          onCollapsedChange={(value) => setCollapsed((current) => ({ ...current, [g]: value }))}
        />
      ),
      tasks: all.slice(g * 100, g * 100 + 100),
    }));
    return <TaskList groups={groups} />;
  },
};

/** In a scrolling panel of its own (a sheet, a page's content area), it virtualizes against that. */
export const InScrollingPanel: Story = {
  render: () => (
    <div
      style={{ height: 420, overflow: 'auto', border: '1px dashed var(--border)', borderRadius: 8 }}
    >
      <TaskList tasks={manyTasks(TOTAL)} />
    </div>
  ),
};
