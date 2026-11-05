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
