import type { Meta, StoryObj } from '@storybook/react-vite';
import { MonthGrid } from '../../calendar/MonthGrid';
import { TimeGrid } from '../../calendar/TimeGrid';
import { CalendarScreen } from './CalendarScreen';
import { MONTH_EVENTS, NOW, WEEK, WEEK_EVENTS, WEEK_EVENTS_MORE } from './data';

const meta = {
  title: 'Screens/Calendar/Calendar',
  parameters: { layout: 'fullscreen' },
} satisfies Meta;

export default meta;
type Story = StoryObj<typeof meta>;

/** Figma "Calendar (week)" (7158:13273) */
export const Week: Story = {
  render: () => (
    <CalendarScreen view="week">
      <TimeGrid days={WEEK} events={WEEK_EVENTS} now={NOW} startHour={8} endHour={24} />
    </CalendarScreen>
  ),
};

/** Figma "Calendar (week) — focus time, tentative, out of office" (7424:45312) */
export const WeekFocusTentativeOutOfOffice: Story = {
  name: 'Week — focus time, tentative, out of office',
  render: () => (
    <CalendarScreen view="week">
      <TimeGrid days={WEEK} events={WEEK_EVENTS_MORE} now={NOW} startHour={8} endHour={24} />
    </CalendarScreen>
  ),
};

/** Figma "Calendar (day)" (7158:13856) */
export const Day: Story = {
  render: () => (
    <CalendarScreen view="day">
      <TimeGrid days={[WEEK[0]]} events={WEEK_EVENTS} now={NOW} startHour={8} endHour={24} />
    </CalendarScreen>
  ),
};

/** Figma "Calendar (month)" (7158:18439) */
export const Month: Story = {
  render: () => (
    <CalendarScreen view="month">
      <MonthGrid month={NOW} today={NOW} events={MONTH_EVENTS} />
    </CalendarScreen>
  ),
};
