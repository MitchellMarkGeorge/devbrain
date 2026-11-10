import { useCallback, useRef, useState } from 'react';
import { useSuspenseQuery } from '@tanstack/react-query';
import { DateTime } from 'luxon';
import { isId, type EventId, type TaskId } from '@common/ids';
import type { Event } from '@common/types';
import type { EventInputProps } from '../../calendar';
import {
  CalendarView,
  Skeleton,
  useFormat,
  useWorkspaceShell,
  type CalendarViewEvent,
  type CalendarViewHandle,
  type CalendarViewSelection,
} from '../../components';
import { trpc } from '../../ipc';
import { PageHeaderSlot } from '../app/page-header';
import { TaskSheet } from '../tasks/sheet/TaskSheet';
import {
  defaultDurationMinutes,
  draftForDay,
  draftFromSelection,
} from './create/CreateEventDialog';
import { useCreateEvent } from './create/use-create-event';
import { CalendarHeaderEnd, CalendarHeaderStart } from './header/CalendarHeader';
import { CalendarSidePanel } from './panel/CalendarSidePanel';
import { neighbouringRanges, rangeOptionsOf, stepDate } from './range';
import { dateParam, openEventSearch, type CalendarSearch } from './search';
import { EventSheet } from './sheet/EventSheet';
import { useCalendarSearch } from './use-calendar-search';
import { useDelayedLoading, useEventSources, usePrefetchRanges } from './use-event-sources';
import styles from './CalendarPage.module.css';

type SheetItem = Pick<CalendarSearch, 'open' | 'occurrence'>;

/**
 * The calendar (`/app/$workspaceId/calendar`, Figma `7158:13273` week, `7158:13856` day,
 * `7158:18439` month): the header (the month, the calendar filter, the view, ‹ Today ›, New
 * Event) over `CalendarView`, driven by the URL's `view` and `date`; the mini calendar and agenda
 * at the right in wide windows; and the sheet at `?open=`, an event's (`evt_…`) or a task's
 * (`tsk_…`, from the agenda or an event's linked tasks).
 */
export function CalendarPage() {
  const { resolved, setSearch } = useCalendarSearch();
  const settings = useSuspenseQuery(trpc.settings.get.queryOptions()).data;
  const calendars = useSuspenseQuery(trpc.calendars.list.queryOptions()).data;
  const { size } = useWorkspaceShell();
  const { now } = useFormat('minute');
  const view = useRef<CalendarViewHandle>(null);

  const options = rangeOptionsOf(settings, resolved.view);
  const sources = useEventSources(calendars, view);
  usePrefetchRanges(calendars, neighbouringRanges(resolved.view, resolved.date, options));
  const [loading, onLoading] = useDelayedLoading();
  const duration = defaultDurationMinutes(settings);

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
  const closeSheet = () => setSearch({ open: undefined, occurrence: undefined });
  const sheetOpen = resolved.open !== undefined;

  return (
    <>
      <PageHeaderSlot
        place={
          <CalendarHeaderStart
            date={resolved.date}
            calendars={calendars}
            narrow={sheetOpen || size !== 'wide'}
          />
        }
        actions={
          <CalendarHeaderEnd
            view={resolved.view}
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
    </>
  );
}
