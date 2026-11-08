import type { Meta, StoryObj } from '@storybook/react-vite';
import { TaskPriority, TaskStatus } from '@common/types';
import { storyDate } from '../../lib/story-dates';
import {
  sampleEventLink,
  sampleLinear,
  sampleNoteLink,
  sampleProject,
  sampleTask,
} from '../../lists/TaskRow/fixtures';
import { BoardCard } from './BoardCard';

const task = sampleTask({
  title: 'Ship the onboarding flow',
  status: TaskStatus.IN_PROGRESS,
  priority: TaskPriority.HIGH,
  external: sampleLinear('ENG-124'),
  link: sampleEventLink('Mitchell / Jesse 1:1', 'indigo'),
  project: sampleProject('DevBrain 1.0', 'blue'),
  subtaskProgress: { completed: 3, total: 4 },
  dueDate: storyDate(0),
});

const meta = {
  title: 'Board/BoardCard',
  component: BoardCard,
  args: { task },
  argTypes: { state: { control: 'inline-radio', options: [undefined, 'hover', 'focus'] } },
  decorators: [
    (Story) => (
      <div style={{ width: 300 }}>
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof BoardCard>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

/** A synced task with no link: its source and project pills */
export const SourceOnly: Story = {
  args: {
    task: sampleTask({
      title: 'Fix calendar sync for recurring events',
      priority: TaskPriority.MEDIUM,
      external: sampleLinear('ENG-131'),
      project: sampleProject('Calendar', 'green'),
      dueDate: storyDate(10),
    }),
  },
};

/** A local task linked to a note, overdue: its date in red */
export const LinkedNote: Story = {
  args: {
    task: sampleTask({
      title: 'Write the Q4 planning doc',
      status: TaskStatus.IN_PROGRESS,
      link: sampleNoteLink('Q4 planning notes'),
      project: sampleProject('Planning', 'amber'),
      dueDate: storyDate(-3),
    }),
  },
};

/** A local task with no links has no pills */
export const Local: Story = {
  args: { task: sampleTask({ title: 'Renew the domain', priority: TaskPriority.MEDIUM }) },
};

/** Long names wrap onto another line of pills, and a name too long for the card ellipsises */
export const ManyPills: Story = {
  args: {
    task: sampleTask({
      title: 'Migrate the calendar sync to the new provider API',
      status: TaskStatus.IN_PROGRESS,
      priority: TaskPriority.HIGH,
      external: sampleLinear('ENG-212'),
      subtaskProgress: { completed: 1, total: 5 },
      link: sampleEventLink('Platform planning with the calendar and integrations teams', 'pink'),
      project: sampleProject('Integrations', 'indigo'),
      dueDate: storyDate(-3),
    }),
  },
};

export const Hover: Story = { args: { state: 'hover' } };
export const Focus: Story = { args: { state: 'focus' } };

export const Completed: Story = {
  args: {
    task: {
      ...task,
      status: TaskStatus.COMPLETED,
      subtaskProgress: { completed: 4, total: 4 },
      dueDate: storyDate(-1),
    },
  },
};
