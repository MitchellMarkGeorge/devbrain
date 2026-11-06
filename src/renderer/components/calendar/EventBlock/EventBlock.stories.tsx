import type { Meta, StoryObj } from '@storybook/react-vite';
import { TaskStatus } from '@common/types';
import { AllDayEvent, EventBlock, NowIndicator } from './EventBlock';

const meta = {
  title: 'Calendar/EventBlock',
  component: EventBlock,
  args: { title: 'Design Review', time: '10:00 – 11:00 AM', color: 'green', meeting: true },
  argTypes: {
    color: { control: 'select', options: ['red', 'amber', 'green', 'blue', 'indigo', 'pink'] },
    kind: { control: 'inline-radio', options: ['event', 'task', 'focus'] },
  },
  decorators: [
    (Story) => (
      <div style={{ width: 180 }}>
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof EventBlock>;

export default meta;
type Story = StoryObj<typeof meta>;

/** kind=event: the calendar's colour bar */
export const Default: Story = { args: { style: { height: 56 } } };

/** kind=task: a task scheduled on the grid shows its status icon instead of a bar */
export const Task: Story = {
  args: { kind: 'task', status: TaskStatus.NOT_STARTED, style: { height: 56 } },
};

/** Focus time: a neutral bar and a dashed outline */
export const Focus: Story = {
  args: {
    kind: 'focus',
    title: 'Focus time',
    time: '10:00 AM – 12:00 PM',
    meeting: false,
    style: { height: 94 },
  },
};

/** You answered "maybe": dashed and faded to 70% */
export const Tentative: Story = {
  args: {
    title: 'Hiring sync',
    time: '3:00 – 4:00 PM · Maybe',
    color: 'amber',
    meeting: false,
    tentative: true,
    style: { height: 46 },
  },
};

/** 30 minutes (22px) and 15 minutes (16px): one line */
export const Compact: Story = {
  render: () => (
    <div style={{ display: 'grid', gap: 8 }}>
      <EventBlock
        title="Mitchell / Jesse 1:1"
        time="10:30 AM"
        color="green"
        size="compact"
        style={{ height: 22 }}
      />
      <EventBlock title="Daily Standup" color="green" size="compact" style={{ height: 16 }} />
    </div>
  ),
};

/** An all-day event in the calendar's tile colour, one in a synced calendar's #rrggbb, and out of office */
export const AllDay: Story = {
  render: () => (
    <div style={{ display: 'grid', gap: 8, width: 360 }}>
      <AllDayEvent title="AWS Incubator Course" color="amber" />
      <AllDayEvent title="Holiday (Google calendar colour)" color="#039be5" />
      <AllDayEvent title="Out of office" kind="out-of-office" style={{ width: 116 }} />
    </div>
  ),
};

/** A slice of a day column: hour lines, two events and the red now line */
export const InDayColumn: Story = {
  decorators: [],
  render: () => {
    const hour = 48;
    return (
      <div
        style={{
          position: 'relative',
          width: 124,
          height: hour * 4,
          backgroundImage: `repeating-linear-gradient(to bottom, var(--border) 0 1px, transparent 1px ${hour}px)`,
        }}
      >
        <EventBlock
          title="Daily Standup"
          color="green"
          size="compact"
          style={{ position: 'absolute', top: 1, left: 3, right: 3, height: 16 }}
        />
        <EventBlock
          title="Design Review"
          time="10:00 – 11:00 AM"
          color="blue"
          style={{ position: 'absolute', top: hour + 1, left: 3, right: 3, height: hour - 2 }}
        />
        <NowIndicator style={{ position: 'absolute', top: hour * 2.6 }} />
      </div>
    );
  },
};
