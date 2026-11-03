import type { Meta, StoryObj } from '@storybook/react-vite';
import { ScheduleCard } from '..';
import { fn } from 'storybook/test';

const meta = {
  title: 'Planning/ScheduleCard',
  component: ScheduleCard,
  tags: ['autodocs'],
  args: {
    title: 'Weekly planning',
    time: '10:00 AM',
    duration: '30 min',
    soon: 'In 12 mins',
    color: 'blue',
    join: true,
    onJoin: fn(),
  },
} satisfies Meta<typeof ScheduleCard>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Default: Story = {};
