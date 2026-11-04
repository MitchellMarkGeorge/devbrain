import type { Meta, StoryObj } from '@storybook/react-vite';
import { CalendarAgenda, CalendarAgendaItem } from './CalendarAgenda';

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

/** The calendar page's right panel: events by their colour bar, a due task by its status */
export const Default: Story = {
  render: (args) => (
    <CalendarAgenda {...args}>
      <CalendarAgendaItem title="Sprint Planning" time="9:00 AM" color="green" />
      <CalendarAgendaItem title="Daily Standup" time="9:30 AM" color="green" />
      <CalendarAgendaItem title="Design Review" time="1:00 PM" color="blue" />
      <CalendarAgendaItem title="Write PKCE migration guide" time="Due" status="not-started" />
      <CalendarAgendaItem title="AWS Incubator Course" time="All day" color="amber" />
    </CalendarAgenda>
  ),
};
