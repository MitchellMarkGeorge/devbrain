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
 * - A change refetches every query, and each answers on its own: the grid keeps what it shows
 *   until the last has, and changes once.
 * - An input is made once for the rows a query returned and its calendar's colour, so a render
 *   that changed neither hands FullCalendar the same objects, which it takes as no change.
 *
 * `loading` is true once a read has lasted a moment, so a cached one never flashes the skeleton.
 */
export function useCalendarItems(
  calendars: readonly Calendar[],
  range: DayRange,
  showTasks: boolean,
): { events: EventInput[]; loading: boolean } {
  const queryClient = useQueryClient();
  const visible = calendars.filter((calendar) => calendar.visible);

  // the range shown before this one, whose rows stand in while this one's load
  const [ranges, setRanges] = useState({ shown: range, before: range });
  if (!sameRange(ranges.shown, range)) setRanges({ shown: range, before: ranges.shown });
  const before = sameRange(ranges.shown, range) ? ranges.before : ranges.shown;

  const eventResults = useQueries({
    queries: visible.map((calendar) => ({
      ...calendarEventsQuery(calendar.id, range),
      placeholderData: () =>
        queryClient.getQueryData(calendarEventsQuery(calendar.id, before).queryKey),
    })),
  });
  const taskResult = useQuery({
    ...tasksDueBetweenQuery(range),
    enabled: showTasks,
    placeholderData: () => queryClient.getQueryData(tasksDueBetweenQuery(before).queryKey),
  });

  // a range's tasks may be cached from when they were shown; the same inputs while the query
  // holds the same rows, as the events' are
  const tasks = showTasks ? taskResult.data : undefined;
  const taskItems = useMemo(() => toTaskInputs(tasks ?? []), [tasks]);

  const next = [
    ...visible.flatMap((calendar, index) =>
      eventInputs(eventResults[index].data ?? NO_EVENTS, calendar),
    ),
    ...taskItems,
  ];
  const results = showTasks ? [...eventResults, taskResult] : eventResults;
  // rows already drawn for this range are being read again (a change was reported)
  const refetching = results.some(
    (result) => result.isFetching && result.data !== undefined && !result.isPlaceholderData,
  );
  // what the queries are of: a step, or a calendar hidden or recoloured, is drawn at once
  const of = `${range.start.getTime()}-${range.end.getTime()}|${showTasks}|${visible
    .map((calendar) => `${calendar.id}:${calendar.color ?? ''}`)
    .join()}`;
  const events = useHeld(next, of, refetching);
  const loading = useDelayed(results.some((result) => result.isFetching));
  return { events, loading };
}

const NO_EVENTS: Event[] = [];

const sameRange = (a: DayRange, b: DayRange) =>
  a.start.getTime() === b.start.getTime() && a.end.getTime() === b.end.getTime();

// The input made for a calendar's rows, kept while its query holds them: FullCalendar compares
// the array it is given item by item, and a new object for an unchanged event would have it parse
// and lay out every event again on each render. (The tasks' are a `useMemo`; the calendars vary
// in number, which a hook's dependencies cannot.)
const eventInputCache = new WeakMap<
  readonly Event[],
  { color: string | null; inputs: EventInput[] }
>();
function eventInputs(events: readonly Event[], calendar: Calendar): EventInput[] {
  const cached = eventInputCache.get(events);
  if (cached && cached.color === calendar.color) return cached.inputs;
  const inputs = events.map((event) => toEventInput(event, calendar));
  eventInputCache.set(events, { color: calendar.color, inputs });
  return inputs;
}

/**
 * `next`, except while `hold` is set and `of` is what it was: then the items last returned. The
 * array returned is the same one until an item changes.
 */
function useHeld(next: EventInput[], of: string, hold: boolean): EventInput[] {
  const [shown, setShown] = useState({ of, items: next });
  if (shown.of === of && (hold || sameItems(shown.items, next))) return shown.items;
  setShown({ of, items: next });
  return next;
}

const sameItems = (a: readonly unknown[], b: readonly unknown[]) =>
  a.length === b.length && a.every((item, index) => item === b[index]);

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
