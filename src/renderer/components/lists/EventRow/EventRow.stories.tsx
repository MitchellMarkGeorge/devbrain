import type { Meta, StoryObj } from '@storybook/react-vite';
import { storyDate } from '../../lib/story-dates';
import { EventRow, type EventRowData } from './EventRow';

/** A core event, cut to what the row reads; the story's `now` is 9:48 AM on 22 Jun 2026. */
function sampleEvent(fields: Partial<EventRowData> & Pick<EventRowData, 'title'>): EventRowData {
  return {
    startAt: storyDate(0, 10),
    endAt: storyDate(0, 10, 30),
    allDay: false,
    recurrenceRule: null,
    meetingUrl: null,
    color: null,
    ...fields,
  };
}

const meta = {
  title: 'Lists/EventRow',
  component: EventRow,
  args: {
    event: sampleEvent({
      title: 'Mitchell / Jesse 1:1',
      recurrenceRule: 'RRULE:FREQ=WEEKLY;BYDAY=MO',
      meetingUrl: 'https://meet.google.com/abc-defg-hij',
      color: 'indigo',
    }),
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

/** Starts in 12 minutes: red from an hour before, with Join for its meeting link. */
export const Default: Story = {};

/**
 * What the row works out from the event and `now`: running ("Now"), later today (`date-today`),
 * another day (the day before the time), and the calendar's colour for an event with none.
 */
export const List: Story = {
  render: () => (
    <div>
      <EventRow
        event={sampleEvent({
          title: 'Standup',
          startAt: storyDate(0, 9, 30),
          endAt: storyDate(0, 9, 55),
          recurrenceRule: 'RRULE:FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR',
          meetingUrl: 'https://meet.google.com/abc-defg-hij',
          color: 'green',
        })}
      />
      <EventRow
        event={sampleEvent({
          title: 'Design review: empty states',
          startAt: storyDate(0, 14),
          endAt: storyDate(0, 15),
          color: 'pink',
        })}
      />
      <EventRow
        event={sampleEvent({
          title: 'Dentist',
          startAt: storyDate(1, 8),
          endAt: storyDate(1, 9),
        })}
        calendarColor="amber"
      />
    </div>
  ),
};
