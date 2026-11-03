import type { Meta, StoryObj } from '@storybook/react-vite';
import { EventBlock } from '..';
import { fn } from 'storybook/test';

const meta = {
  title: 'Planning/EventBlock',
  component: EventBlock,
  tags: ['autodocs'],
  args: {
    title: 'Weekly planning',
    time: '10:00–10:30 AM',
    color: 'blue',
    meeting: true,
    height: 90,
    onClick: fn(),
  },
} satisfies Meta<typeof EventBlock>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Default: Story = {};
