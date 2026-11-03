import type { Meta, StoryObj } from '@storybook/react-vite';
import { BoardCard } from '..';
import { tasks } from './fixtures';
import { fn } from 'storybook/test';

const meta = {
  title: 'Planning/BoardCard',
  component: BoardCard,
  tags: ['autodocs'],
  args: { task: tasks[0], onOpen: fn() },
} satisfies Meta<typeof BoardCard>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Default: Story = {};
export const Completed: Story = { args: { task: tasks[3] } };
export const Overdue: Story = { args: { task: tasks[2] } };
