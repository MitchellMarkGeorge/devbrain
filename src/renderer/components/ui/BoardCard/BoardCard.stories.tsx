import type { Meta, StoryObj } from '@storybook/react-vite';
import { BoardCard, type BoardTask } from './BoardCard';

const task: BoardTask = {
  title: 'Ship the onboarding flow',
  status: 'in-progress',
  priority: 'high',
  key: 'ENG-124',
  event: 'Mitchell / Jesse 1:1',
  eventColor: 'indigo',
  project: 'DevBrain 1.0',
  projectColor: 'blue',
  subtasks: [3, 4],
  date: 'Today',
  dateTone: 'today',
};

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
    task: {
      title: 'Fix calendar sync for recurring events',
      status: 'not-started',
      priority: 'medium',
      key: 'ENG-131',
      project: 'Calendar',
      projectColor: 'green',
      date: 'Oct 2',
    },
  },
};

/** A local task linked to a note */
export const LinkedNote: Story = {
  args: {
    task: {
      title: 'Write the Q4 planning doc',
      status: 'in-progress',
      priority: 'low',
      note: 'Q4 planning notes',
      project: 'Planning',
      projectColor: 'amber',
      date: 'Sep 28',
      dateTone: 'overdue',
    },
  },
};

/** A local task with no links has no pills */
export const Local: Story = {
  args: { task: { title: 'Renew the domain', status: 'not-started', priority: 'medium' } },
};

/** Long names wrap onto another line of pills, and a name too long for the card ellipsises */
export const ManyPills: Story = {
  args: {
    task: {
      title: 'Migrate the calendar sync to the new provider API',
      status: 'in-progress',
      priority: 'high',
      key: 'ENG-212',
      subtasks: [1, 5],
      event: 'Platform planning with the calendar and integrations teams',
      eventColor: 'pink',
      project: 'Integrations',
      projectColor: 'indigo',
      date: 'Sep 28',
      dateTone: 'overdue',
    },
  },
};

export const Hover: Story = { args: { state: 'hover' } };
export const Focus: Story = { args: { state: 'focus' } };

export const Completed: Story = {
  args: { task: { ...task, status: 'completed', subtasks: [4, 4], date: 'Sep 24' } },
};
