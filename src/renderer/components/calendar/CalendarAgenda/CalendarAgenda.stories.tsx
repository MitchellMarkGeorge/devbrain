import type { Meta, StoryObj } from '@storybook/react-vite';
import { TaskStatus } from '@common/types';
import { storyDate } from '../../lib/story-dates';
import { CalendarAgenda, CalendarAgendaItem, type AgendaEventData } from './CalendarAgenda';

const event = (title: string, hour: number, minute: number, color: string): AgendaEventData => ({
  title,
  startAt: storyDate(0, hour, minute),
  endAt: storyDate(0, hour + 1, minute),
  allDay: false,
  color,
});

const meta = {
  title: 'Calendar/CalendarAgenda',
  component: CalendarAgenda,
  args: { title: 'Today' },
  decorators: [
    (Story) => (
      <div style={{ width: 223 }}>
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof CalendarAgenda>;

export default meta;
type Story = StoryObj<typeof meta>;

/**
 * The calendar page's right panel, from core's events and tasks: events by their colour bar and
 * start time (in the toolbar's clock format), a due task by its status
 */
export const Default: Story = {
  render: (args) => (
    <CalendarAgenda {...args}>
      <CalendarAgendaItem event={event('Sprint Planning', 9, 0, 'green')} />
      <CalendarAgendaItem event={event('Daily Standup', 9, 30, 'green')} />
      <CalendarAgendaItem event={event('Design Review', 13, 0, 'blue')} />
      <CalendarAgendaItem
        task={{
          title: 'Write PKCE migration guide',
          status: TaskStatus.NOT_STARTED,
          dueDate: storyDate(0),
        }}
      />
      <CalendarAgendaItem
        event={{
          title: 'AWS Incubator Course',
          startAt: storyDate(0),
          endAt: storyDate(1),
          allDay: true,
          color: null,
        }}
        calendarColor="amber"
      />
    </CalendarAgenda>
  ),
};
