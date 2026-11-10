import { useCallback, useEffect, useMemo, useState, type RefObject } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import type { EventSourceInput } from '@fullcalendar/react';
import type { Calendar } from '@common/types';
import type { CalendarViewHandle } from '../../components';
import { toEventSource } from '../../calendar';
import { calendarEventsQuery, isCalendarEventsKey, readCalendarEvents } from './queries';
import type { DayRange } from './range';

/**
 * One FullCalendar event source per visible calendar, coloured by it, each reading its range
 * through React Query (docs/renderer/implementation-plan.md, "Calendar"): the query invalidator
 * stays in charge of freshness. When it invalidates any of these reads (core reported an `event`
 * or `calendar` change), FullCalendar refetches, once for the lot.
 *
 * A calendar's source is made once (again only when its colour changes), since a new source object
 * makes FullCalendar fetch it.
 */
export function useEventSources(
  calendars: readonly Calendar[],
  view: RefObject<CalendarViewHandle | null>,
): EventSourceInput[] {
  const queryClient = useQueryClient();
  // each calendar's source, kept while its colour is the same: FullCalendar drops a source it is
  // no longer given (its events go) and fetches one it hasn't seen, so hiding one calendar must
  // hand it the others' sources as they were
  const [made] = useState(() => new Map<string, EventSourceInput>());
  const visible = calendars.filter((calendar) => calendar.visible);
  const key = visible.map((calendar) => `${calendar.id}:${calendar.color ?? ''}`).join();
  const sources = useMemo(() => {
    return visible.map((calendar) => {
      const id = `${calendar.id}:${calendar.color ?? ''}`;
      let source = made.get(id);
      if (!source) {
        source = toEventSource(calendar, (range) =>
          readCalendarEvents(queryClient, calendar.id, range),
        );
        made.set(id, source);
      }
      return source;
    });
    // `key` names everything a source is made from
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, made, queryClient]);

  useEffect(() => {
    let scheduled = false;
    return queryClient.getQueryCache().subscribe((event) => {
      if (event.type !== 'updated' || event.action.type !== 'invalidate') return;
      if (!isCalendarEventsKey(event.query.queryKey) || scheduled) return;
      // one refetch for every read the same change invalidated
      scheduled = true;
      queueMicrotask(() => {
        scheduled = false;
        view.current?.getApi().refetchEvents();
      });
    });
  }, [queryClient, view]);

  return sources;
}

/** Fetches the ranges either side of the one shown, so ‹ and › draw at once. */
export function usePrefetchRanges(calendars: readonly Calendar[], ranges: readonly DayRange[]) {
  const queryClient = useQueryClient();
  const ids = calendars.filter((calendar) => calendar.visible).map((calendar) => calendar.id);
  const key = `${ids.join()}|${ranges.map((r) => `${r.start.getTime()}-${r.end.getTime()}`).join()}`;
  useEffect(() => {
    for (const range of ranges) {
      for (const id of ids) void queryClient.prefetchQuery(calendarEventsQuery(id, range));
    }
    // `key` names the calendars and ranges
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, queryClient]);
}

/** FullCalendar's `loading`, shown only once it has lasted a moment, so a cached read never flashes. */
export function useDelayedLoading(delay = 150): [boolean, (loading: boolean) => void] {
  const [loading, setLoading] = useState(false);
  const [late, setLate] = useState(false);
  useEffect(() => {
    if (!loading) return;
    const timer = setTimeout(() => setLate(true), delay);
    return () => clearTimeout(timer);
  }, [loading, delay]);
  // FullCalendar reports it while it renders: take it after
  const onLoading = useCallback((next: boolean) => {
    queueMicrotask(() => {
      setLoading(next);
      if (!next) setLate(false);
    });
  }, []);
  return [loading && late, onLoading];
}
