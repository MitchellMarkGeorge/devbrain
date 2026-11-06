import type { Meta, StoryObj } from '@storybook/react-vite';
import { Calendar, CircleAlert, Folder } from 'lucide-react';
import { DropdownMenuItem, DropdownMenuSeparator } from '../../ui/DropdownMenu';
import { EventRow } from '../EventRow';
import { GroupHeading } from '../GroupHeading';
import { StatusIcon } from '../../entities/StatusIcon';
import { TaskStatus } from '@common/types';
import { storyDate } from '../../lib/story-dates';
import { BUSY_TASK, SAMPLE_SUBTASKS, SAMPLE_TASKS } from '../TaskRow/fixtures';
import { TaskList } from './TaskList';

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

/** The grouped list: groups by due date and by what tasks link to, with an event among them. */
export const Grouped: Story = {
  render: () => (
    <div>
      <GroupHeading
        label="Overdue"
        subtitle="Oldest due Jun 19"
        icon={CircleAlert}
        iconColor="var(--status-overdue)"
        tint="var(--status-overdue-tint)"
        done={0}
        total={2}
      />
      <TaskList tasks={[SAMPLE_TASKS[1], { ...SAMPLE_TASKS[2], dueDate: storyDate(-1) }]} />
      <GroupHeading
        label="Mitchell / Jesse 1:1"
        subtitle="Event · Today, 10:00 AM"
        bar="indigo"
        done={1}
        total={3}
      />
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
      <TaskList tasks={[SAMPLE_TASKS[0], SAMPLE_TASKS[4]]} />
      <GroupHeading
        label="In progress"
        subtitle="Started this week"
        icon={<StatusIcon status={TaskStatus.IN_PROGRESS} />}
        tint="var(--status-in-progress-tint)"
        done={2}
        total={5}
      />
      <TaskList tasks={[SAMPLE_TASKS[3]]} />
      <GroupHeading label="Later" subtitle="Due next month" icon={Calendar} count={8} collapsed />
    </div>
  ),
};
