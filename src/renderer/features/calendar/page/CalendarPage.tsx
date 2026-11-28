import { useCallback, useLayoutEffect, useRef, useState, type RefObject } from 'react';
import { useSuspenseQuery } from '@tanstack/react-query';
import { DateTime } from 'luxon';
import { isId, type EventId } from '@common/ids';
import type { Event } from '@common/types';
import { dateParam, type EventInputProps } from '@renderer/shared/lib/calendar';
import {
  CalendarView,
  Skeleton,
  useFormat,
  useWorkspaceShell,
  type CalendarViewEvent,
  type CalendarViewHandle,
  type CalendarViewSelection,
  Page,
  PageToolbar,
} from '@renderer/components';
import { trpc } from '@renderer/ipc';
import { useSheet } from '@renderer/shared/hooks/use-sheet';
import {
  defaultDurationMinutes,
  draftForDay,
  draftFromSelection,
} from '../components/create/CreateEventDialog';
import { useCreateEvent } from '../hooks/use-create-event';
import {
  CalendarHeaderEnd,
  CalendarHeaderStart,
  headerLayout,
} from '../components/header/CalendarHeader';
import { CalendarSidePanel } from '../components/panel/CalendarSidePanel';
import { neighbouringRanges, rangeOptionsOf, stepDate } from '../lib/range';
import { openEventSearch, type CalendarSearch } from '../api/search';
import { useCalendarSearch } from '../hooks/use-calendar-search';
import { useDelayedLoading, useEventSources, usePrefetchRanges } from '../hooks/use-event-sources';
import styles from './CalendarPage.module.css';

/**
 * The calendar (`/app/$workspaceId/calendar`, Figma `7158:13273` week, `7158:13856` day,
 * `7158:18439` month): the header (the month, the calendar filter, the view, ‹ Today ›, New
 * Event) over `CalendarView`, driven by the URL's `view` and `date`, with the tasks due on each
 * day beside the events (the Filter's "Tasks"); the mini calendar and agenda
 * at the right in wide windows; and the sheet at `?sheet=`: an event (`evt_…`), a task (`tsk_…`,
 * from the grid, the agenda or an event's linked tasks) or an event's note (`nte_…`).
 */
export function CalendarPage() {
  const { search, resolved, setSearch } = useCalendarSearch();
  const settings = useSuspenseQuery(trpc.settings.get.queryOptions()).data;
  const calendars = useSuspenseQuery(trpc.calendars.list.queryOptions()).data;
  const { size } = useWorkspaceShell();
  const { now } = useFormat('minute');
  const view = useRef<CalendarViewHandle>(null);
  // the toolbar steps down as it narrows (beside the sidebar and the sheet)
  const toolbar = useRef<HTMLDivElement>(null);
  const layout = headerLayout(useWidth(toolbar));

  const options = rangeOptionsOf(settings, resolved.view);
  // the workspace's own setting (the Filter's "Tasks"), on until it is unticked
  const workspace = useSuspenseQuery(trpc.workspaces.current.queryOptions()).data;
  const showTasks = workspace?.settings.calendar.showTasks ?? true;
  const sources = useEventSources(calendars, view, showTasks);
  usePrefetchRanges(
    calendars,
    neighbouringRanges(resolved.view, resolved.date, options),
    showTasks,
  );
  const [loading, onLoading] = useDelayedLoading();
  const duration = defaultDurationMinutes(settings);

  // the sheet: each item shown in it is a history entry of its own, and so is closing it
  const sheet = useSheet();
  const showInSheet = sheet.show;
  const openEvent = useCallback(
    (id: EventId, occurrence?: Date) => showInSheet(id, { occurrence: occurrence?.toISOString() }),
    [showInSheet],
  );
  const createEvent = useCreateEvent(
    useCallback(
      (event: Event) =>
        setSearch({ ...openEventSearch(event.id), date: dateParam(event.startAt) }, { push: true }),
      [setSearch],
    ),
  );

  // a day: the date param, left out for today
  // another day or view adds a history entry, so Back returns to the week (or view) before
  const goTo = (day: Date, patch: Partial<CalendarSearch> = {}) => {
    const date = DateTime.fromJSDate(day).hasSame(DateTime.fromJSDate(now), 'day')
      ? undefined
      : dateParam(day);
    const moved =
      date !== search.date || (patch.view !== undefined && patch.view !== resolved.view);
    setSearch({ ...patch, date }, { push: moved });
  };

  const onEventClick = (event: CalendarViewEvent) => {
    // a task due that day: its sheet
    if (isId('task', event.id)) return sheet.show(event.id);
    const { recurring } = event.props as Partial<EventInputProps>;
    // a series' expanded occurrence is named by its start in the series
    openEvent(event.id as EventId, recurring ? event.start : undefined);
  };

  return (
    <Page title="Calendar">
      {/*
       * the month, the filter and the controls are the page's toolbar, in the page under the title
       * bar, where the 24px title and 32px controls have room
       */}
      <PageToolbar
        ref={toolbar}
        start={
          <CalendarHeaderStart
            date={resolved.date}
            calendars={calendars}
            showTasks={showTasks}
            layout={layout}
          />
        }
        end={
          <CalendarHeaderEnd
            view={resolved.view}
            layout={layout}
            onViewChange={(next) => setSearch({ view: next }, { push: next !== resolved.view })}
            onStep={(direction) => goTo(stepDate(resolved.view, resolved.date, direction))}
            onToday={() => setSearch({ date: undefined }, { push: search.date !== undefined })}
            onNewEvent={() => createEvent(draftForDay(resolved.date, now, duration))}
          />
        }
      />
      <div className={styles.page} data-testid="calendar-page" data-view={resolved.view}>
        <div className={styles.grid}>
          {loading && (
            <div className={styles.loading} data-testid="calendar-loading" aria-busy>
              <Skeleton height={4} width="100%" />
            </div>
          )}
          <CalendarView
            ref={view}
            view={resolved.view}
            date={resolved.date}
            eventSources={sources}
            firstDay={options.firstDay}
            hideWeekends={options.hideWeekends}
            timeFormat={settings.general.timeFormat}
            selectedEventId={sheet.id}
            onEventClick={onEventClick}
            onSelect={(selection: CalendarViewSelection) =>
              createEvent(draftFromSelection(selection, duration))
            }
            onDayClick={(day) => goTo(day, { view: 'day' })}
            onLoading={onLoading}
          />
        </div>
        {size === 'wide' && !sheet.open && (
          <CalendarSidePanel
            date={resolved.date}
            firstDay={options.firstDay}
            calendars={calendars}
            onDateChange={(day) => goTo(day)}
            onOpenEvent={openEvent}
            onOpenTask={sheet.show}
          />
        )}
      </div>
      {sheet.render()}
    </Page>
  );
}

/**
 * The width of the element `ref` holds, followed as it changes; Infinity until it is measured. The
 * element is read once, after the first commit: React sets a child's ref before its parent's
 * layout effects run, so it is there, as long as it is rendered in place and always (not behind a
 * condition or a portal), and stays the same element.
 */
function useWidth(ref: RefObject<HTMLElement | null>): number {
  const [width, setWidth] = useState(Infinity);
  useLayoutEffect(() => {
    const element = ref.current;
    if (!element || typeof ResizeObserver === 'undefined') return;
    // it reports the width at once, then as it changes. The toolbar's own layout never changes its
    // width, so this can't feed back on itself
    const observer = new ResizeObserver(([entry]) => setWidth(entry.contentRect.width));
    observer.observe(element);
    return () => observer.disconnect();
  }, [ref]);
  return width;
}
