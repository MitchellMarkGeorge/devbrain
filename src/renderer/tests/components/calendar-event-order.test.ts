import { describe, expect, it } from 'vitest';
import { TaskStatus } from '@common/types';
import {
  compareCalendarItems,
  type OrderedItem,
} from '@renderer/components/calendar/CalendarView/event-order';

// The order of a day's items in the calendar: FullCalendar's default, with tasks after events and
// closed tasks after open ones.

const DAY = 24 * 60 * 60 * 1000;
const MONDAY = new Date(2026, 5, 22).getTime();

const allDay = (title: string, extra: Partial<OrderedItem> = {}): OrderedItem => ({
  title,
  start: MONDAY,
  duration: DAY,
  allDay: 1,
  ...extra,
});
const task = (title: string, status = TaskStatus.NOT_STARTED): OrderedItem =>
  allDay(title, { kind: 'task', status });
const titles = (items: OrderedItem[]) => [...items].sort(compareCalendarItems).map((i) => i.title);

describe('compareCalendarItems', () => {
  it('puts a day’s events first, then open tasks, then closed ones, each by title', () => {
    expect(
      titles([
        task('Review the RFC', TaskStatus.COMPLETED),
        task('Write the guide'),
        allDay('Conference'),
        task('Drop the middleware', TaskStatus.CANCELLED),
        task('Audit the scopes', TaskStatus.IN_PROGRESS),
      ]),
    ).toEqual([
      'Conference',
      'Audit the scopes',
      'Write the guide',
      'Drop the middleware',
      'Review the RFC',
    ]);
  });

  it('keeps FullCalendar’s order ahead of that: earlier, then longer, then timed before all-day', () => {
    const course = allDay('Course', { duration: 3 * DAY });
    const standup: OrderedItem = {
      title: 'Standup',
      start: MONDAY + 9.5 * 60 * 60 * 1000,
      duration: 15 * 60 * 1000,
      allDay: 0,
    };
    // a task due today comes after a longer all-day event, and before the day's first meeting
    expect(titles([standup, task('Write the guide'), course])).toEqual([
      'Course',
      'Write the guide',
      'Standup',
    ]);
    // yesterday's task before today's event
    expect(titles([allDay('Conference'), { ...task('Overdue'), start: MONDAY - DAY }])).toEqual([
      'Overdue',
      'Conference',
    ]);
    // the same start and length: the timed one first, as FullCalendar's `allDay` field orders them
    const timed = { ...allDay('Timed'), allDay: 0 };
    expect(titles([allDay('All day'), timed])).toEqual(['Timed', 'All day']);
  });
});
