import type { Meta, StoryObj } from '@storybook/react-vite';
import { BoardCard, BoardColumn } from '..';
import { tasks } from './fixtures';
import { fn } from 'storybook/test';

const meta = {
  title: 'Planning/BoardColumn',
  component: BoardColumn,
  tags: ['autodocs'],
  args: {
    name: 'In progress',
    status: 'in-progress',
    count: 2,
    onAdd: fn(),
    children: (
      <>
        <BoardCard task={tasks[0]} />
        <BoardCard task={tasks[1]} />
      </>
    ),
  },
} satisfies Meta<typeof BoardColumn>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Default: Story = {};
