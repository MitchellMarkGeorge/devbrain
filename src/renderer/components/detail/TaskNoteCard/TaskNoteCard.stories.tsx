import type { Meta, StoryObj } from '@storybook/react-vite';
import { TaskNoteCard } from './TaskNoteCard';

const meta = {
  title: 'Detail/TaskNoteCard',
  component: TaskNoteCard,
  args: {
    title: 'Onboarding flow notes',
    project: 'Website redesign',
    projectColor: 'blue',
    tasksSummary: '2 tasks · 1 in progress',
    updated: '2h ago',
    layout: 'auto',
  },
  argTypes: { layout: { control: 'inline-radio', options: ['auto', 'row', 'stacked'] } },
  decorators: [
    (Story) => (
      <div style={{ maxWidth: 720 }}>
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof TaskNoteCard>;

export default meta;
type Story = StoryObj<typeof meta>;

/** On a task page: one row, like a task row */
export const Row: Story = {};

export const LongTitle: Story = {
  args: {
    title: 'Notes from the onboarding research sessions with the first ten design partners',
  },
};

/** In a narrow side sheet (380px), `auto` stacks: the pills go under the title */
export const InSheet: Story = {
  decorators: [
    (Story) => (
      <div style={{ width: 348 }}>
        <Story />
      </div>
    ),
  ],
};

export const NoProject: Story = { args: { project: undefined, tasksSummary: '1 task' } };
