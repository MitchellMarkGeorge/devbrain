import { useEffect, useMemo, useState } from 'react';
import { useQueries, useQuery, useQueryClient, noop } from '@tanstack/react-query';
import type { EventInput } from '@fullcalendar/react';
import type { Calendar, Event } from '@common/types';
import { toEventInput, toTaskInputs } from '@renderer/shared/lib/calendar';
import { calendarEventsQuery, tasksDueBetweenQuery } from '../api/queries';
import type { DayRange } from '../lib/range';

/**
 * What the grid draws for a range, as FullCalendar event input: every visible calendar's events,
 * each calendar its own query, and with `showTasks` the tasks due in the range, after them. The
 * page loads them itself (one `useQueries` for the calendars, a query for the tasks) and hands
 * FullCalendar the array, so the query invalidator keeps the grid fresh as it does any other
 * page: a query the grid shows is refetched when core reports a change it reads.
 *
 * - While a range not yet read loads, the range shown before stands in for it (its series already
 *   repeat into the new one), so a step never draws an empty grid first.
 * - A change refetches every query, and each answers on its own: the grid draws each answer as it
 *   comes. That is cheap: FullCalendar keeps an event's element by its id.
 * - The inputs are made again only when a query's rows or the calendars changed (`useMemo`), so
 *   any other render hands FullCalendar the same objects, which it takes as no change. Otherwise
 *   it would parse every event and repeat every series again on each render.
 *
 * `loading` is true once a read has lasted a moment, so a cached one never flashes the skeleton.
 */
export function useCalendarItems(
  calendars: readonly Calendar[],
  range: DayRange,
  showTasks: boolean,
): { events: EventInput[]; loading: boolean } {
  const queryClient = useQueryClient();
  const visible = useMemo(() => calendars.filter((calendar) => calendar.visible), [calendars]);

  // the range shown before this one, whose rows stand in while this one's load
  const [ranges, setRanges] = useState({ shown: range, before: range });
  if (!sameRange(ranges.shown, range)) setRanges({ shown: range, before: ranges.shown });
  const before = sameRange(ranges.shown, range) ? ranges.before : ranges.shown;

  const { rows, fetching } = useQueries({
    queries: visible.map((calendar) => ({
      ...calendarEventsQuery(calendar.id, range),
      placeholderData: () =>
        queryClient.getQueryData(calendarEventsQuery(calendar.id, before).queryKey),
    })),
    combine: rowsOf,
  });
  // made again only when a calendar's rows, or the calendars, changed
  const eventItems = useMemo(
    () =>
      visible.flatMap((calendar, index) =>
        (rows[index] ?? []).map((event) => toEventInput(event, calendar)),
      ),
    [rows, visible],
  );
  const taskResult = useQuery({
    ...tasksDueBetweenQuery(range),
    enabled: showTasks,
    placeholderData: () => queryClient.getQueryData(tasksDueBetweenQuery(before).queryKey),
  });

  // a range's tasks may be cached from when they were shown
  const tasks = showTasks ? taskResult.data : undefined;
  const taskItems = useMemo(() => toTaskInputs(tasks ?? []), [tasks]);

  const events = useMemo(() => [...eventItems, ...taskItems], [eventItems, taskItems]);
  const loading = useDelayed(fetching || (showTasks && taskResult.isFetching));
  return { events, loading };
}

const sameRange = (a: DayRange, b: DayRange) =>
  a.start.getTime() === b.start.getTime() && a.end.getTime() === b.end.getTime();

/**
 * What the grid needs of the calendars' queries: each one's rows, and whether any is being read.
 * `useQueries` keeps the object it returned, and each part of it, while that part is equal to the
 * one before: `rows` is the same array until a query's rows change, whatever `fetching` does. So
 * the inputs made from it are too.
 */
function rowsOf(results: readonly { data: Event[] | undefined; isFetching: boolean }[]) {
  return {
    rows: results.map((result) => result.data),
    fetching: results.some((result) => result.isFetching),
  };
}

/** `on`, once it has been on for `delay` ms. */
function useDelayed(on: boolean, delay = 150): boolean {
  const [late, setLate] = useState(false);
  useEffect(() => {
    if (!on) return;
    const timer = setTimeout(() => setLate(true), delay);
    return () => {
      clearTimeout(timer);
      setLate(false);
    };
  }, [on, delay]);
  return on && late;
}

/** Fetches the ranges either side of the one shown, so ‹ and › draw at once. */
export function usePrefetchRanges(
  calendars: readonly Calendar[],
  ranges: readonly DayRange[],
  showTasks: boolean,
) {
  const queryClient = useQueryClient();
  const ids = calendars.filter((calendar) => calendar.visible).map((calendar) => calendar.id);
  const key = `${ids.join()}|${showTasks}|${ranges.map((r) => `${r.start.getTime()}-${r.end.getTime()}`).join()}`;
  useEffect(() => {
    for (const range of ranges) {
      for (const id of ids) queryClient.query(calendarEventsQuery(id, range)).catch(noop);
      if (showTasks) queryClient.query(tasksDueBetweenQuery(range)).catch(noop);
    }
    // `key` names the calendars, the tasks and the ranges
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, queryClient]);
}
