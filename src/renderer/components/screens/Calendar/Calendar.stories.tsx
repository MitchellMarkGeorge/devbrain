import type { Meta, StoryObj } from '@storybook/react-vite';
import type { EventSourceInput } from '@fullcalendar/react';
import { CalendarView, calendarEventInput } from '../../calendar/CalendarView';
import type { CalendarEvent } from '../../types';
import { CalendarScreen } from './CalendarScreen';
import { MONTH_EVENTS, NOW, TASKS_DUE, WEEK_EVENTS, WEEK_EVENTS_MORE } from './data';

const meta = {
  title: 'Screens/Calendar/Calendar',
  // the screens' "now" (8:46 AM), so the panel's next meeting reads "In 14m"
  parameters: { layout: 'fullscreen', now: NOW },
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

// the tasks are a source of their own beside the calendars', as the page would add one
const withTasks = (events: CalendarEvent[]): EventSourceInput[] => [
  ...sources(events),
  { id: 'tasks', events: TASKS_DUE.map(calendarEventInput) },
];

/** Mock-up: tasks on their due day, in the week's all-day row */
export const WeekWithTasks: Story = {
  name: 'Week — tasks due (mock-up)',
  render: () => (
    <CalendarScreen view="week" filter="All calendars, Tasks">
      <CalendarView
        view="week"
        date={NOW}
        now={NOW}
        eventSources={withTasks(WEEK_EVENTS)}
        startHour={8}
        endHour={24}
      />
    </CalendarScreen>
  ),
};

/** Mock-up: tasks on their due day, as lines in the month's cells */
export const MonthWithTasks: Story = {
  name: 'Month — tasks due (mock-up)',
  render: () => (
    <CalendarScreen view="month" filter="All calendars, Tasks">
      <CalendarView
        view="month"
        date={NOW}
        now={NOW}
        eventSources={withTasks(MONTH_EVENTS)}
        onDayClick={() => {}}
      />
    </CalendarScreen>
  ),
};
