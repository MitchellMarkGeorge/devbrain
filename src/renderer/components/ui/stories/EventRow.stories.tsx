import type { Meta, StoryObj } from '@storybook/react-vite';
import { EventRow } from '..';
import { fn } from 'storybook/test';

const meta = {
  title: 'Planning/EventRow',
  component: EventRow,
  tags: ['autodocs'],
  args: {
    event: {
      title: 'Weekly planning',
      time: '10:00–10:30 AM',
      relative: 'In 12 mins',
      meeting: true,
      repeats: 'Every Monday',
      color: 'blue',
      tone: 'today',
    },
    onOpen: fn(),
    onJoin: fn(),
  },
} satisfies Meta<typeof EventRow>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Default: Story = {};
