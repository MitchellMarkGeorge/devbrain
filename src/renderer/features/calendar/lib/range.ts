import { DateTime } from 'luxon';
import type { AppSettings } from '@common/types';
import type { CalendarViewParam } from '../api/search';

// The calendar's ranges, from the URL's view and date and the settings: what FullCalendar shows for
// them (and so asks its event sources for), the neighbouring ranges the page prefetches, and where
// ‹ and › go. In local time, as FullCalendar's `timeZone: 'local'` is.

export interface CalendarRangeOptions {
  /** the week's first column: 1 for Monday, 0 for Sunday */
  firstDay: 0 | 1;
  /** the week and month views leave Saturday and Sunday out */
  hideWeekends: boolean;
}

export interface DayRange {
  start: Date;
  /** exclusive: the midnight after the last day shown */
  end: Date;
}

/** The settings as `CalendarView` takes them. */
export function rangeOptionsOf(
  settings: Pick<AppSettings, 'calendar'>,
  view: CalendarViewParam,
): CalendarRangeOptions {
  return {
    firstDay: settings.calendar.firstDayOfWeek === 'sunday' ? 0 : 1,
    // the day view shows the day asked for, weekend or not
    hideWeekends: settings.calendar.hideWeekends && view !== 'day',
  };
}

/** The first day of the week `date` is in, at midnight. */
export function startOfWeek(date: Date, firstDay: 0 | 1): DateTime {
  const day = DateTime.fromJSDate(date).startOf('day');
  // luxon's weekday: Monday 1 … Sunday 7; FullCalendar's firstDay: Sunday 0, Monday 1
  const back = (day.weekday - (firstDay === 0 ? 7 : 1) + 7) % 7;
  return day.minus({ days: back });
}

const isWeekend = (day: DateTime) => day.weekday >= 6;

/**
 * The days FullCalendar shows (its `activeRange`), which its event sources are asked for: the
 * week or day, or the month's weeks from the one with the 1st to the one with its last day
 * (`fixedWeekCount` off). Hidden weekends are trimmed off either end, as FullCalendar does (a
 * test checks the two agree).
 */
export function visibleRange(
  view: CalendarViewParam,
  date: Date,
  { firstDay, hideWeekends }: CalendarRangeOptions,
): DayRange {
  const day = DateTime.fromJSDate(date).startOf('day');
  let start: DateTime;
  let end: DateTime;
  if (view === 'day') {
    start = day;
    end = day.plus({ days: 1 });
  } else if (view === 'week') {
    start = startOfWeek(date, firstDay);
    end = start.plus({ days: 7 });
  } else {
    // the month's first and last days shown: a week whose only days in the month are hidden
    // weekends is left out
    let first = day.startOf('month');
    let last = day.endOf('month').startOf('day');
    while (hideWeekends && isWeekend(first)) first = first.plus({ days: 1 });
    while (hideWeekends && isWeekend(last)) last = last.minus({ days: 1 });
    start = startOfWeek(first.toJSDate(), firstDay);
    end = startOfWeek(last.toJSDate(), firstDay).plus({ days: 7 });
  }
  if (hideWeekends && view !== 'day') {
    while (isWeekend(start)) start = start.plus({ days: 1 });
    while (isWeekend(end.minus({ days: 1 }))) end = end.minus({ days: 1 });
  }
  return { start: start.toJSDate(), end: end.toJSDate() };
}

/** The anchor day one view earlier (-1) or later (1): ‹ and ›. */
export function stepDate(view: CalendarViewParam, date: Date, direction: -1 | 1): Date {
  const day = DateTime.fromJSDate(date).startOf('day');
  const unit =
    view === 'month'
      ? { months: direction }
      : { days: view === 'week' ? 7 * direction : direction };
  return day.plus(unit).toJSDate();
}

/** The ranges before and after the one shown, which the page prefetches. */
export function neighbouringRanges(
  view: CalendarViewParam,
  date: Date,
  options: CalendarRangeOptions,
): DayRange[] {
  return [-1 as const, 1 as const].map((direction) =>
    visibleRange(view, stepDate(view, date, direction), options),
  );
}

/** The header's title: the anchor's month, "June 2026" (`short`: "Jun 2026"). */
export function monthTitle(date: Date, length: 'long' | 'short' = 'long'): string {
  return DateTime.fromJSDate(date).toFormat(length === 'long' ? 'LLLL yyyy' : 'LLL yyyy');
}
