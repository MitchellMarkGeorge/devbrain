import { queryOptions } from '@tanstack/react-query';
import { DateTime } from 'luxon';
import type { CalendarId } from '@common/ids';
import type { TaskListItem } from '@common/types';
import { ipc, trpc } from '@renderer/ipc';
import type { DayRange } from '../lib/range';

// The calendar page's reads, as React Query options, so the route's loader, the grid and the
// agenda share one cache entry per range, which the query invalidator keeps fresh.

/**
 * One calendar's events over a range: what the grid reads for each visible calendar
 * (`useCalendarItems`). Never stale by time, but invalidated, and so fetched again while the grid
 * shows it, when core reports an `event` or `calendar` change.
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

/** Today and tomorrow, from local midnight: the agenda's days. */
export function agendaRange(today: Date): DayRange {
  const start = DateTime.fromJSDate(today).startOf('day');
  // each end the start of its own day: one need not start at midnight (see `visibleRange`)
  return { start: start.toJSDate(), end: start.plus({ days: 2 }).startOf('day').toJSDate() };
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

// core's largest page
const TASKS_DUE_PAGE = 200;

/**
 * Every task due in a range, by due date: what the grid reads when it shows tasks. `tasks.list`
 * page after page as one query (a range with more than a page is rare), as the tasks page's
 * `groupTasksQuery` is: a plain query, so the grid holds it in one `useQueries` with the
 * calendars'. Its key starts with `tasks.list`'s, so a change the task list shows refetches it.
 * Like `calendarEventsQuery`, never stale by time.
 */
export function tasksDueBetweenQuery(range: DayRange) {
  const input = {
    // `dueAfter` is exclusive: a task due at the range's first midnight is in it
    filter: { dueAfter: new Date(range.start.getTime() - 1), dueBefore: range.end },
    sort: { sortBy: 'dueDate' as const, direction: 'asc' as const },
    limit: TASKS_DUE_PAGE,
  };
  return queryOptions({
    queryKey: [...trpc.tasks.list.queryKey(input), { pages: 'all' }],
    queryFn: async (): Promise<TaskListItem[]> => {
      const tasks: TaskListItem[] = [];
      let cursor: string | null = null;
      do {
        const page = await ipc.tasks.list.query({ ...input, cursor });
        tasks.push(...page.items);
        cursor = page.nextCursor;
      } while (cursor !== null);
      return tasks;
    },
    staleTime: Infinity,
  });
}
