import { useCallback } from 'react';
import { useSuspenseQuery } from '@tanstack/react-query';
import { trpc } from '@renderer/ipc';
import { useFormat } from '@renderer/components';
import { calendarRoute } from '../api/route-api';
import {
  resolveCalendarSearch,
  type CalendarSearch,
  type ResolvedCalendarSearch,
} from '../api/search';

/**
 * The calendar page's state from its URL, every missing param filled in, and the function that
 * changes it. Moving through the calendar replaces the history entry (Back goes to the previous
 * page, not the previous week); opening the sheet pushes one (Back closes it).
 */
export function useCalendarSearch(): {
  search: CalendarSearch;
  resolved: ResolvedCalendarSearch;
  setSearch: (patch: Partial<CalendarSearch>, options?: { push?: boolean }) => void;
} {
  const search = calendarRoute.useSearch();
  const navigate = calendarRoute.useNavigate();
  const settings = useSuspenseQuery(trpc.settings.get.queryOptions()).data;
  const { now } = useFormat();
  const setSearch = useCallback(
    (patch: Partial<CalendarSearch>, options: { push?: boolean } = {}) =>
      void navigate({
        search: (previous) => ({ ...previous, ...patch }),
        replace: !options.push,
        state: options.push ? (previous) => ({ ...previous, openedSheet: true }) : undefined,
      }),
    [navigate],
  );
  return { search, resolved: resolveCalendarSearch(search, settings, now), setSearch };
}
