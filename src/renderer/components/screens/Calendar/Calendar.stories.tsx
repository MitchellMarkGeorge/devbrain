import type { Meta, StoryObj } from '@storybook/react-vite';
import type { EventInput } from '@fullcalendar/react';
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

const inputs = (events: CalendarEvent[]): EventInput[] => events.map(calendarEventInput);

/** Figma "Calendar (week)" (7158:13273) */
export const Week: Story = {
  render: () => (
    <CalendarScreen view="week">
      <CalendarView
        view="week"
        date={NOW}
        now={NOW}
        events={inputs(WEEK_EVENTS)}
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
        events={inputs(WEEK_EVENTS_MORE)}
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
        events={inputs(WEEK_EVENTS)}
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
        events={inputs(MONTH_EVENTS)}
        onDayClick={() => {}}
      />
    </CalendarScreen>
  ),
};

// the tasks due follow the calendars' events, as the page passes them
const withTasks = (events: CalendarEvent[]): EventInput[] => inputs([...events, ...TASKS_DUE]);

/** The tasks due each day in the week's all-day row, under the all-day events */
export const WeekWithTasks: Story = {
  name: 'Week — tasks due',
  render: () => (
    <CalendarScreen view="week">
      <CalendarView
        view="week"
        date={NOW}
        now={NOW}
        events={withTasks(WEEK_EVENTS)}
        startHour={8}
        endHour={24}
      />
    </CalendarScreen>
  ),
};

/** The tasks due each day as lines in the month's cells, after the all-day events */
export const MonthWithTasks: Story = {
  name: 'Month — tasks due',
  render: () => (
    <CalendarScreen view="month">
      <CalendarView
        view="month"
        date={NOW}
        now={NOW}
        events={withTasks(MONTH_EVENTS)}
        onDayClick={() => {}}
      />
    </CalendarScreen>
  ),
};
