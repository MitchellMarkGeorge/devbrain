import type { Meta, StoryObj } from '@storybook/react-vite';
import type { EventSourceInput } from '@fullcalendar/core';
import { CalendarView, calendarEventInput } from '../../calendar/CalendarView';
import type { CalendarEvent } from '../../types';
import { CalendarScreen } from './CalendarScreen';
import { MONTH_EVENTS, NOW, WEEK_EVENTS, WEEK_EVENTS_MORE } from './data';

const meta = {
  title: 'Screens/Calendar/Calendar',
  parameters: { layout: 'fullscreen' },
} satisfies Meta;

export default meta;
type Story = StoryObj<typeof meta>;

const sources = (events: CalendarEvent[]): EventSourceInput[] => [
  { events: events.map(calendarEventInput) },
];

/** Figma "Calendar (week)" (7158:13273) */
export const Week: Story = {
  render: () => (
    <CalendarScreen view="week">
      <CalendarView
        view="week"
        date={NOW}
        now={NOW}
        eventSources={sources(WEEK_EVENTS)}
        startHour={8}
        endHour={24}
      />
    </CalendarScreen>
  ),
};

/** Figma "Calendar (week) — focus time, tentative, out of office" (7424:45312) */
export const WeekFocusTentativeOutOfOffice: Story = {
  name: 'Week — focus time, tentative, out of office',
  render: () => (
    <CalendarScreen view="week">
      <CalendarView
        view="week"
        date={NOW}
        now={NOW}
        eventSources={sources(WEEK_EVENTS_MORE)}
        startHour={8}
        endHour={24}
      />
    </CalendarScreen>
  ),
};

/** Figma "Calendar (day)" (7158:13856) */
export const Day: Story = {
  render: () => (
    <CalendarScreen view="day">
      <CalendarView
        view="day"
        date={NOW}
        now={NOW}
        eventSources={sources(WEEK_EVENTS)}
        startHour={8}
        endHour={24}
      />
    </CalendarScreen>
  ),
};

/** Figma "Calendar (month)" (7158:18439) */
export const Month: Story = {
  render: () => (
    <CalendarScreen view="month">
      <CalendarView
        view="month"
        date={NOW}
        now={NOW}
        eventSources={sources(MONTH_EVENTS)}
        onDayClick={() => {}}
      />
    </CalendarScreen>
  ),
};
