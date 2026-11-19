import type { QueryClient } from '@tanstack/react-query';
import { DateTime } from 'luxon';
import type { CalendarId } from '@common/ids';
import { trpc } from '@renderer/ipc';
import type { DayRange } from '../lib/range';

// The calendar page's reads, as React Query options, so the route's loader, FullCalendar's event
// sources and the agenda share one cache entry per range, which the query invalidator keeps fresh.

/**
 * One calendar's events over a range: what its FullCalendar event source reads. Never stale by
 * time (FullCalendar asks again only when the range changes or the data did), but invalidated, and
 * so fetched again, when core reports an `event` or `calendar` change.
 */
export function calendarEventsQuery(calendarId: CalendarId, range: DayRange) {
  return {
    ...trpc.events.listForCalendar.queryOptions({
      start: range.start,
      end: range.end,
      calendarIds: [calendarId],
    }),
    staleTime: Infinity,
  };
}

/** Whether a cached query is one of `calendarEventsQuery`'s. */
export function isCalendarEventsKey(queryKey: readonly unknown[]): boolean {
  const [path] = queryKey;
  return Array.isArray(path) && path[0] === 'events' && path[1] === 'listForCalendar';
}

/** Reads a calendar's events for FullCalendar: the cached ones while fresh, else a fetch. */
export function readCalendarEvents(
  queryClient: QueryClient,
  calendarId: CalendarId,
  range: DayRange,
) {
  return queryClient.query(calendarEventsQuery(calendarId, range));
}

/** Today and tomorrow, from local midnight: the agenda's days. */
export function agendaRange(today: Date): DayRange {
  const start = DateTime.fromJSDate(today).startOf('day');
  return { start: start.toJSDate(), end: start.plus({ days: 2 }).toJSDate() };
}

/** The agenda's events: every visible calendar's, today and tomorrow. */
export function agendaEventsQuery(range: DayRange) {
  return trpc.events.listForCalendar.queryOptions({ start: range.start, end: range.end });
}

/** The tasks due on a day, open or not, for the agenda. */
export function tasksDueQuery(day: Date) {
  return trpc.tasks.list.queryOptions({
    filter: { dueOn: DateTime.fromJSDate(day).startOf('day').toJSDate() },
    sort: { sortBy: 'priority', direction: 'desc' },
    limit: 50,
  });
}

/**
 * The tasks due in a range, open or not, for the week and day views' due lane. `dueAfter` is
 * exclusive, so it starts a millisecond before the range: a task due at the first midnight counts.
 */
export function tasksDueInRangeQuery(range: DayRange) {
  return trpc.tasks.list.queryOptions({
    filter: {
      dueAfter: new Date(range.start.getTime() - 1),
      dueBefore: range.end,
      excludeSubtasks: true,
    },
    sort: { sortBy: 'priority', direction: 'desc' },
    limit: 200,
  });
}

/** most overdue tasks counted; more show as this many ("100 overdue") */
export const OVERDUE_COUNT_LIMIT = 100;

/** The open tasks due before today: their count heads today's due lane. */
export function tasksOverdueQuery(today: Date) {
  return trpc.tasks.list.queryOptions({
    filter: {
      dueBefore: DateTime.fromJSDate(today).startOf('day').toJSDate(),
      excludeClosed: true,
      excludeSubtasks: true,
    },
    limit: OVERDUE_COUNT_LIMIT,
  });
}
