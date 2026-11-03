import type { Meta, StoryObj } from '@storybook/react-vite';
import { TaskRow } from '..';
import { tasks } from './fixtures';
import { fn } from 'storybook/test';

const meta = {
  title: 'Planning/TaskRow',
  component: TaskRow,
  tags: ['autodocs'],
  args: { task: tasks[0], onSelect: fn(), onStatusChange: fn(), onOpen: fn() },
  decorators: [
    (Story) => (
      <div role="grid" aria-label="Task preview">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof TaskRow>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Default: Story = {};
export const Completed: Story = { args: { task: tasks[3] } };
export const Overdue: Story = { args: { task: tasks[2] } };
export const Selected: Story = { args: { selected: true } };
export const KeyboardFocus: Story = { args: { state: 'focus' } };
export const Stacked: Story = {
  args: {
    task: { ...tasks[0], event: 'Weekly planning', eventColor: 'blue', note: 'Design system' },
    stack: 'both',
  },
};
