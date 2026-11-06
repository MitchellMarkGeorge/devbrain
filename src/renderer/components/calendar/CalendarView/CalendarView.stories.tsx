import type { Meta, StoryObj } from '@storybook/react-vite';
import type { EventSourceInput } from '@fullcalendar/core';
import type { CalendarId, EventId } from '@common/ids';
import { EventKind, EventStatus, type Calendar, type Event } from '@common/types';
import { toEventInput } from '../../../calendar';
import type { CalendarEvent } from '../../types';
import { MONTH_EVENTS, NOW, WEEK_EVENTS, WEEK_EVENTS_MORE } from '../../screens/Calendar/data';
import { CalendarView, calendarEventInput } from './CalendarView';

/** The events as one source, coloured by their own swatch names */
const source = (events: CalendarEvent[]): EventSourceInput[] => [
  { events: events.map(calendarEventInput) },
];

const at = (day: number, h: number, m = 0) => new Date(2026, 5, day, h, m);

/** A scheduled task and side-by-side events */
const OVERLAPS: CalendarEvent[] = [
  {
    id: 'task',
    title: 'Write PKCE migration guide',
    start: at(24, 15),
    end: at(24, 16),
    kind: 'task',
    status: 'not-started',
  },
  { id: 'interview', title: 'Interview', start: at(25, 15), end: at(25, 16, 30), color: 'pink' },
  { id: 'debrief', title: 'Debrief', start: at(25, 15, 30), end: at(25, 16), color: 'indigo' },
];

const meta = {
  title: 'Calendar/CalendarView',
  component: CalendarView,
  parameters: { layout: 'fullscreen' },
  args: {
    view: 'week',
    date: NOW,
    now: NOW,
    eventSources: source(WEEK_EVENTS),
    startHour: 8,
    endHour: 24,
  },
  decorators: [
    (Story) => (
      <div style={{ height: 720 }}>
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof CalendarView>;

export default meta;
type Story = StoryObj<typeof meta>;

/** The week of 22 June 2026: an all-day chip across three days, the now line on Monday */
export const Week: Story = {};

/** The day view: the same grid with one column */
export const Day: Story = { args: { view: 'day' } };

/** June 2026: all-day events first, "+2 more" on the 22nd, other months' days dimmed */
export const Month: Story = {
  args: { view: 'month', eventSources: source(MONTH_EVENTS), onDayClick: () => {} },
  decorators: [
    (Story) => (
      <div style={{ height: 760 }}>
        <Story />
      </div>
    ),
  ],
};

/** Focus time (dashed, neutral), a tentative "Maybe" and a day out of office */
export const FocusTentativeOutOfOffice: Story = {
  name: 'Focus time, tentative, out of office',
  args: { eventSources: source(WEEK_EVENTS_MORE) },
};

/** A task on the grid, and overlapping events side by side */
export const TaskAndOverlaps: Story = {
  args: { eventSources: source([...WEEK_EVENTS, ...OVERLAPS]) },
};

/** The event whose sheet is open */
export const Selected: Story = {
  args: { selectedEventId: 'design', onEventClick: () => {} },
};

/** Weeks starting on Sunday, on the 24-hour clock */
export const SundayFirst24Hour: Story = {
  name: 'Sunday first, 24-hour clock',
  args: { firstDay: 0, timeFormat: '24' },
};

/** The working week alone */
export const HideWeekends: Story = { args: { hideWeekends: true } };

// A recurring series as core returns it, mapped with the adapter's toEventInput: the standup at
// 9:30 every weekday, Wednesday's moved to 11:30 (an occurrence row) and Friday's cancelled.

const WORK = {
  id: 'cal_work' as CalendarId,
  sourceId: null,
  externalId: null,
  name: 'Work',
  color: '#22c55e',
  timeZone: null,
  isPrimary: true,
  selected: true,
  visible: true,
  historyLoadedFrom: null,
  createdAt: NOW,
  updatedAt: NOW,
} satisfies Calendar;

const event = (fields: Partial<Event> & Pick<Event, 'id' | 'title' | 'startAt' | 'endAt'>) =>
  ({
    calendarId: WORK.id,
    description: null,
    allDay: false,
    startDate: null,
    endDate: null,
    timeZone: null,
    location: null,
    recurrenceRule: null,
    seriesId: null,
    originalStartAt: null,
    status: EventStatus.CONFIRMED,
    response: null,
    kind: EventKind.DEFAULT,
    meetingUrl: null,
    color: null,
    exdates: [],
    external: null,
    createdAt: NOW,
    updatedAt: NOW,
    favoritedAt: null,
    viewedAt: null,
    ...fields,
  }) satisfies Event;

const STANDUP = event({
  id: 'evt_standup' as EventId,
  title: 'Daily Standup',
  startAt: at(22, 9, 30),
  endAt: at(22, 9, 45),
  recurrenceRule: 'RRULE:FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR',
  // Wednesday's slot (moved) and Friday's (cancelled)
  exdates: [at(24, 9, 30), at(26, 9, 30)],
});

const STANDUP_MOVED = event({
  id: 'evt_standup_jun24' as EventId,
  title: 'Daily Standup (moved)',
  startAt: at(24, 11, 30),
  endAt: at(24, 11, 45),
  seriesId: STANDUP.id,
  originalStartAt: at(24, 9, 30),
});

const SERIES_SOURCES: EventSourceInput[] = [
  {
    color: WORK.color,
    events: [STANDUP, STANDUP_MOVED].map((e) => toEventInput(e, WORK)),
  },
  { events: WEEK_EVENTS.filter((e) => !e.id.startsWith('standup')).map(calendarEventInput) },
];

/**
 * A series from `toEventInput`: Monday, Tuesday and Thursday at 9:30 from the rule, Wednesday's
 * moved to 11:30, nothing on Friday
 */
export const RecurringSeries: Story = { args: { eventSources: SERIES_SOURCES } };

/** The same series across the month */
export const RecurringSeriesMonth: Story = {
  args: { view: 'month', eventSources: SERIES_SOURCES },
  decorators: Month.decorators,
};
