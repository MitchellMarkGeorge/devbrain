import { useCallback, useLayoutEffect, useRef, useState, type RefObject } from 'react';
import { useQuery, useSuspenseQuery } from '@tanstack/react-query';
import { useRouter } from '@tanstack/react-router';
import { DateTime } from 'luxon';
import { isId, type EventId, type TaskId } from '@common/ids';
import type { Event } from '@common/types';
import type { EventInputProps } from '@renderer/shared/lib/calendar';
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
import { TaskSheet } from '@renderer/features/tasks/components/sheet/TaskSheet';
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
import { neighbouringRanges, rangeOptionsOf, stepDate, visibleRange } from '../lib/range';
import { tasksDueInRangeQuery, tasksOverdueQuery } from '../api/queries';
import { dateParam, openEventSearch, type CalendarSearch } from '../api/search';
import { EventSheet } from '../components/sheet/EventSheet';
import { useCalendarSearch } from '../hooks/use-calendar-search';
import { calendarRoute } from '../api/route-api';
import { useDelayedLoading, useEventSources, usePrefetchRanges } from '../hooks/use-event-sources';
import styles from './CalendarPage.module.css';

type SheetItem = Pick<CalendarSearch, 'open' | 'occurrence'>;

declare module '@tanstack/history' {
  interface HistoryState {
    /** the event sheet showed its note with this entry: "‹ Event" goes back to the event */
    openedEventNote?: boolean;
  }
}

/**
 * The calendar (`/app/$workspaceId/calendar`, Figma `7158:13273` week, `7158:13856` day,
 * `7158:18439` month): the header (the month, the calendar filter, the view, ‹ Today ›, New
 * Event) over `CalendarView`, driven by the URL's `view` and `date`; the mini calendar and agenda
 * at the right in wide windows; and the sheet at `?open=`, an event's (`evt_…`) or a task's
 * (`tsk_…`, from the agenda or an event's linked tasks).
 */
export function CalendarPage() {
  const { resolved, setSearch } = useCalendarSearch();
  const navigate = calendarRoute.useNavigate();
  const { workspaceId } = calendarRoute.useParams();
  const router = useRouter();
  const settings = useSuspenseQuery(trpc.settings.get.queryOptions()).data;
  const calendars = useSuspenseQuery(trpc.calendars.list.queryOptions()).data;
  const { size } = useWorkspaceShell();
  const { now } = useFormat('minute');
  const view = useRef<CalendarViewHandle>(null);
  // the toolbar steps down as it narrows (beside the sidebar and the sheet)
  const toolbar = useRef<HTMLDivElement>(null);
  const layout = headerLayout(useWidth(toolbar));

  const options = rangeOptionsOf(settings, resolved.view);
  const sources = useEventSources(calendars, view);
  usePrefetchRanges(calendars, neighbouringRanges(resolved.view, resolved.date, options));
  const [loading, onLoading] = useDelayedLoading();
  const duration = defaultDurationMinutes(settings);

  // the due lane: the tasks due in the week or day shown, and how many are overdue (on today)
  const range = visibleRange(resolved.view, resolved.date, options);
  const dueQuery = useQuery({ ...tasksDueInRangeQuery(range), enabled: resolved.view !== 'month' });
  const overdueQuery = useQuery({ ...tasksOverdueQuery(now), enabled: resolved.view !== 'month' });
  const dueTasks = (dueQuery.data?.items ?? []).flatMap((task) =>
    task.dueDate
      ? [{ id: task.id, title: task.title, status: task.status, dueDate: task.dueDate }]
      : [],
  );

  // the sheet pushes an entry when it opens (Back closes it), and replaces it while open
  const openSheet = useCallback(
    (item: SheetItem) => setSearch(item, { push: resolved.open === undefined }),
    [setSearch, resolved.open],
  );
  const openEvent = useCallback(
    (id: EventId, occurrence?: Date) => openSheet(openEventSearch(id, occurrence)),
    [openSheet],
  );
  const openTask = useCallback(
    (id: TaskId) => openSheet({ open: id, occurrence: undefined }),
    [openSheet],
  );
  const createEvent = useCreateEvent(
    useCallback(
      (event: Event) =>
        setSearch(
          { ...openEventSearch(event.id), date: dateParam(event.startAt) },
          { push: resolved.open === undefined },
        ),
      [setSearch, resolved.open],
    ),
  );

  // a day: the date param, left out for today
  const goTo = (day: Date, patch: Partial<CalendarSearch> = {}) =>
    setSearch({
      ...patch,
      date: DateTime.fromJSDate(day).hasSame(DateTime.fromJSDate(now), 'day')
        ? undefined
        : dateParam(day),
    });

  const onEventClick = (event: CalendarViewEvent) => {
    const { recurring } = event.props as Partial<EventInputProps>;
    // a series' expanded occurrence is named by its start in the series
    openEvent(event.id as EventId, recurring ? event.start : undefined);
  };

  // the sheet stays mounted once `open` leaves the URL, until it has slid out
  const [sheet, setSheet] = useState<SheetItem>({
    open: resolved.open,
    occurrence: resolved.occurrence?.toISOString(),
  });
  const occurrence = resolved.occurrence?.toISOString();
  if (resolved.open && (resolved.open !== sheet.open || occurrence !== sheet.occurrence)) {
    setSheet({ open: resolved.open, occurrence });
  }
  const closeSheet = () => setSearch({ open: undefined, occurrence: undefined, sheet: undefined });
  // the event's note in the sheet: an entry of its own, so Back (and "‹ Event") return to the event
  const openEventNote = () =>
    void navigate({
      search: (previous) => ({ ...previous, sheet: 'note' as const }),
      state: (previous) => ({ ...previous, openedEventNote: true }),
    });
  const closeEventNote = () => {
    if (router.state.location.state.openedEventNote) router.history.back();
    else setSearch({ sheet: undefined });
  };
  const sheetOpen = resolved.open !== undefined;

  return (
    <Page title="Calendar">
      {/*
       * the month, the filter and the controls are the page's toolbar, in the page under the title
       * bar, where the 24px title and 32px controls have room
       */}
      <PageToolbar
        ref={toolbar}
        start={<CalendarHeaderStart date={resolved.date} calendars={calendars} layout={layout} />}
        end={
          <CalendarHeaderEnd
            view={resolved.view}
            layout={layout}
            onViewChange={(next) => setSearch({ view: next })}
            onStep={(direction) => goTo(stepDate(resolved.view, resolved.date, direction))}
            onToday={() => setSearch({ date: undefined })}
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
            selectedEventId={isId('event', resolved.open ?? '') ? resolved.open : undefined}
            onEventClick={onEventClick}
            onSelect={(selection: CalendarViewSelection) =>
              createEvent(draftFromSelection(selection, duration))
            }
            onDayClick={(day) => goTo(day, { view: 'day' })}
            dueTasks={dueTasks}
            overdueCount={overdueQuery.data?.items.length ?? 0}
            onDueTaskClick={(id) => openTask(id as TaskId)}
            onOverdueClick={() =>
              void navigate({
                to: '/app/$workspaceId/tasks',
                params: { workspaceId },
                search: { due: 'overdue', status: 'open' },
              })
            }
            onLoading={onLoading}
          />
        </div>
        {size === 'wide' && !sheetOpen && (
          <CalendarSidePanel
            date={resolved.date}
            firstDay={options.firstDay}
            calendars={calendars}
            onDateChange={(day) => goTo(day)}
            onOpenEvent={openEvent}
            onOpenTask={openTask}
          />
        )}
      </div>
      {sheet.open && isId('event', sheet.open) && (
        <EventSheet
          eventId={sheet.open}
          occurrence={sheet.occurrence ? new Date(sheet.occurrence) : undefined}
          open={sheetOpen}
          onClose={closeSheet}
          onClosed={() => setSheet({ open: undefined, occurrence: undefined })}
          onShowEvent={(id, at) => setSearch(openEventSearch(id, at))}
          onOpenTask={openTask}
          noteView={resolved.eventNote}
          onOpenNote={openEventNote}
          onCloseNote={closeEventNote}
        />
      )}
      {sheet.open && isId('task', sheet.open) && (
        <TaskSheet
          taskId={sheet.open}
          open={sheetOpen}
          onClose={closeSheet}
          onClosed={() => setSheet({ open: undefined, occurrence: undefined })}
        />
      )}
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
