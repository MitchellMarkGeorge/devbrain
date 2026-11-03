import type { Meta, StoryObj } from '@storybook/react-vite';
import { Calendar } from '..';
import { fn } from 'storybook/test';

const meta = {
  title: 'Planning/Calendar',
  component: Calendar,
  tags: ['autodocs'],
  args: {
    defaultMonth: new Date(2026, 10, 1),
    today: new Date(2026, 10, 3),
    defaultSelected: new Date(2026, 10, 12),
    onSelect: fn(),
  },
} satisfies Meta<typeof Calendar>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Default: Story = {};
