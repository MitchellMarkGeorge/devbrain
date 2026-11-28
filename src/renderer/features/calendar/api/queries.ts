import type { QueryClient } from '@tanstack/react-query';
import { DateTime } from 'luxon';
import type { CalendarId } from '@common/ids';
import type { TaskListItem } from '@common/types';
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
 * A page of the tasks due in a range, by due date: what the grid's tasks source reads. Like
 * `calendarEventsQuery`, never stale by time, and fetched again when core reports a change the
 * task list shows.
 */
export function tasksDueBetweenQuery(range: DayRange, cursor?: string) {
  return {
    ...trpc.tasks.list.queryOptions({
      // `dueAfter` is exclusive: a task due at the range's first midnight is in it
      filter: { dueAfter: new Date(range.start.getTime() - 1), dueBefore: range.end },
      sort: { sortBy: 'dueDate', direction: 'asc' },
      limit: TASKS_DUE_PAGE,
      ...(cursor !== undefined && { cursor }),
    }),
    staleTime: Infinity,
  };
}

// core's largest page
const TASKS_DUE_PAGE = 200;

/** Whether a cached query is a read of the task list, as `tasksDueBetweenQuery`'s are. */
export function isTaskListKey(queryKey: readonly unknown[]): boolean {
  const [path] = queryKey;
  return Array.isArray(path) && path[0] === 'tasks' && path[1] === 'list';
}

/** Reads every task due in a range for FullCalendar, page by page: cached pages while fresh. */
export async function readTasksDue(
  queryClient: QueryClient,
  range: DayRange,
): Promise<TaskListItem[]> {
  const tasks: TaskListItem[] = [];
  let cursor: string | undefined;
  do {
    const page = await queryClient.query(tasksDueBetweenQuery(range, cursor));
    tasks.push(...page.items);
    cursor = page.nextCursor ?? undefined;
  } while (cursor !== undefined);
  return tasks;
}
