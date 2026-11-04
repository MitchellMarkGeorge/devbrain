import type { Meta, StoryObj } from '@storybook/react-vite';
import { CalendarDays } from 'lucide-react';
import { Button } from '../Button';
import { StatusIcon } from '../StatusIcon';
import { HomeNotice } from './HomeNotice';

const meta = {
  title: 'Home/HomeNotice',
  component: HomeNotice,
  args: {
    icon: <StatusIcon status="completed" size={20} />,
    title: 'Your day is clear',
    description: (
      <>
        No meetings and nothing due today. You closed <strong>8 tasks</strong> this week.
      </>
    ),
    action: <Button icon={CalendarDays}>Review Week</Button>,
  },
  decorators: [
    (Story) => (
      <div style={{ width: 816 }}>
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof HomeNotice>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
