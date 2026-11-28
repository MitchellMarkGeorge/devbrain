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
 * changes it. A change replaces the history entry unless it asks to `push` one: the page does for
 * another date or view (Back returns to the week or view before), and with `openedSheet` for the
 * sheet (Back closes it).
 */
export interface SetSearchOptions {
  /** adds a history entry rather than replacing this one */
  push?: boolean;
  /** with `push`: the entry is the sheet's, which its close button goes back from */
  openedSheet?: boolean;
}

export function useCalendarSearch(): {
  search: CalendarSearch;
  resolved: ResolvedCalendarSearch;
  setSearch: (patch: Partial<CalendarSearch>, options?: SetSearchOptions) => void;
} {
  const search = calendarRoute.useSearch();
  const navigate = calendarRoute.useNavigate();
  const settings = useSuspenseQuery(trpc.settings.get.queryOptions()).data;
  const { now } = useFormat();
  const setSearch = useCallback(
    (patch: Partial<CalendarSearch>, options: SetSearchOptions = {}) =>
      navigate({
        search: (previous) => ({ ...previous, ...patch }),
        replace: !options.push,
        state:
          options.push && options.openedSheet
            ? (previous) => ({ ...previous, openedSheet: true })
            : undefined,
      }),
    [navigate],
  );
  return { search, resolved: resolveCalendarSearch(search, settings, now), setSearch };
}
