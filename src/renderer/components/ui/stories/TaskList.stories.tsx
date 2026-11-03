import type { Meta, StoryObj } from '@storybook/react-vite';
import { TaskList } from '..';
import { tasks } from './fixtures';
import { fn } from 'storybook/test';

const meta = {
  title: 'Planning/TaskList',
  component: TaskList,
  tags: ['autodocs'],
  args: { tasks, onTaskChange: fn(), onOpenTask: fn(), onSelectionChange: fn() },
} satisfies Meta<typeof TaskList>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Default: Story = {};
export const Selection: Story = { args: { defaultSelected: [0, 1] } };
export const Compact: Story = { args: { density: 'compact' } };
export const Empty: Story = { args: { tasks: [] } };
