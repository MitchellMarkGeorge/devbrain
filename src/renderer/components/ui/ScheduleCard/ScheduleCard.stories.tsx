import type { Meta, StoryObj } from '@storybook/react-vite';
import { Stack } from '../../layout/Flex';
import { ScheduleCard } from './ScheduleCard';

const meta = {
  title: 'Home/ScheduleCard',
  component: ScheduleCard,
  args: {
    title: 'Mitchell / Jesse 1:1',
    time: '9:00 AM',
    soon: '12 mins',
    color: 'indigo',
    onJoin: () => {},
  },
  decorators: [
    (Story) => (
      <div style={{ width: 320 }}>
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof ScheduleCard>;

export default meta;
type Story = StoryObj<typeof meta>;

export const StartingSoon: Story = {};

export const Later: Story = {
  args: {
    title: 'Design review',
    time: '2:00 PM',
    soon: undefined,
    duration: '1 hr',
    color: 'pink',
  },
};

/** Home's "Today's schedule" */
export const TodaysSchedule: Story = {
  render: () => (
    <Stack gap="2">
      <ScheduleCard title="Standup" time="9:00 AM" soon="12 mins" color="green" onJoin={() => {}} />
      <ScheduleCard
        title="Mitchell / Jesse 1:1"
        time="10:00 AM"
        duration="30 mins"
        color="indigo"
        onJoin={() => {}}
      />
      <ScheduleCard title="Focus: onboarding" time="1:00 PM" duration="2 hrs" color="blue" />
    </Stack>
  ),
};
