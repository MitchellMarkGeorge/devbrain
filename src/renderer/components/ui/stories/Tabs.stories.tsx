import type { Meta, StoryObj } from '@storybook/react-vite';
import { Tabs, TaskList } from '..';
import { tasks } from './fixtures';

const meta = {
  title: 'Controls/Tabs',
  component: Tabs,
  tags: ['autodocs'],
  args: {
    items: [
      { value: 'overview', label: 'Overview', content: 'Project overview' },
      { value: 'tasks', label: 'Tasks', content: <TaskList tasks={tasks} /> },
      { value: 'notes', label: 'Notes', content: 'Your project notes' },
    ],
  },
} satisfies Meta<typeof Tabs>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Default: Story = {};
export const Line: Story = { args: { variant: 'line' } };
export const DisabledTab: Story = {
  args: {
    items: [
      { value: 'overview', label: 'Overview', content: 'Overview' },
      { value: 'archive', label: 'Archive', disabled: true },
    ],
  },
};
