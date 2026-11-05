import type { Meta, StoryObj } from '@storybook/react-vite';
import { EventRow } from './EventRow';

const meta = {
  title: 'Lists/EventRow',
  component: EventRow,
  args: {
    event: {
      title: 'Mitchell / Jesse 1:1',
      time: '10:00 – 10:30 AM',
      repeats: 'Weekly',
      meeting: true,
      relative: 'In 12 min',
      tone: 'overdue',
      color: 'indigo',
    },
  },
  decorators: [
    (Story) => (
      <div style={{ maxWidth: 720 }}>
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof EventRow>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const List: Story = {
  render: () => (
    <div>
      <EventRow
        event={{
          title: 'Standup',
          time: '9:30 – 9:45 AM',
          repeats: 'Weekdays',
          meeting: true,
          relative: 'In 12 min',
          tone: 'overdue',
          color: 'green',
        }}
      />
      <EventRow
        event={{
          title: 'Design review: empty states',
          time: '2:00 – 3:00 PM',
          relative: 'In 4h',
          tone: 'today',
          color: 'pink',
        }}
      />
      <EventRow
        event={{
          title: 'Dentist',
          time: 'Tomorrow, 8:00 AM',
          relative: 'Tomorrow',
          color: 'amber',
        }}
      />
    </div>
  ),
};

/**
 * Home's Meetings: the time at the right, Join from 5 minutes before the start, the next meeting
 * filled with `card`, and tomorrow's first meeting dimmed.
 */
export const Home: Story = {
  render: () => (
    <div style={{ width: 800 }}>
      <EventRow
        current
        event={{
          title: 'Sprint Planning',
          meeting: true,
          relative: 'In 12 min',
          tone: 'today',
          color: 'green',
        }}
      />
      <EventRow event={{ title: 'Mitchell / Jesse 1:1', relative: '10:30', color: 'green' }} />
      <EventRow event={{ title: 'Design Review', relative: '1:00', color: 'blue' }} />
      <EventRow muted event={{ title: 'Daily Standup', relative: 'Tue 9:30', color: 'green' }} />
    </div>
  ),
};

/** A meeting in progress keeps Join until it ends. */
export const Now: Story = {
  args: {
    current: true,
    event: {
      title: 'Sprint Planning',
      meeting: true,
      relative: 'Now',
      tone: 'today',
      color: 'green',
    },
  },
};
