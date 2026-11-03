import type { Meta, StoryObj } from '@storybook/react-vite';
import { SelectionBar } from '..';
import { fn } from 'storybook/test';

const meta = {
  title: 'Planning/SelectionBar',
  component: SelectionBar,
  tags: ['autodocs'],
  args: {
    count: 3,
    floating: false,
    onClear: fn(),
    onStatusChange: fn(),
    onPriorityChange: fn(),
    onMove: fn(),
  },
} satisfies Meta<typeof SelectionBar>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Default: Story = {};
