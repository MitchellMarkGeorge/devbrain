import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
  type CSSProperties,
  type ReactNode,
} from 'react';
import FullCalendar from '@fullcalendar/react';
import type {
  CalendarApi,
  DateSelectArg,
  DayCellContentArg,
  DayHeaderContentArg,
  EventClickArg,
  EventContentArg,
  EventInput,
  EventSourceInput,
  MoreLinkArg,
  MoreLinkContentArg,
  NowIndicatorContentArg,
  SlotLabelContentArg,
} from '@fullcalendar/core';
import dayGridPlugin from '@fullcalendar/daygrid';
import interactionPlugin from '@fullcalendar/interaction';
import luxonPlugin from '@fullcalendar/luxon3';
import rrulePlugin from '@fullcalendar/rrule';
import timeGridPlugin from '@fullcalendar/timegrid';
import { cn } from '../../lib/cn';
import { ColourBar } from '../../ui/ColourBar';
import type { CalendarEvent, TaskStatus } from '../../types';
import { AllDayEvent, EventBlock, NowIndicator } from '../EventBlock';
import { formatHour, formatShortTime, formatTimeRange, type TimeFormat } from '../calendar-events';
import styles from './CalendarView.module.css';

export type CalendarViewMode = 'week' | 'day' | 'month';

const FULLCALENDAR_VIEW: Record<CalendarViewMode, string> = {
  week: 'timeGridWeek',
  day: 'timeGridDay',
  month: 'dayGridMonth',
};

const PLUGINS = [timeGridPlugin, dayGridPlugin, interactionPlugin, rrulePlugin, luxonPlugin];

/** pixels per hour, and the height under which a block is compact (title only) */
const HOUR_HEIGHT = 48;
const COMPACT_BELOW = 40;

const WEEKDAY = new Intl.DateTimeFormat('en-US', { weekday: 'short' });

/**
 * The display hints CalendarView reads from an event's `extendedProps` (the adapter's
 * `toEventInput` sets them from core's event).
 */
export interface CalendarViewEventProps {
  /**
   * `event` (default), a `task` scheduled on the grid (its status icon), `focus` time (neutral,
   * dashed) or `out-of-office` (a neutral all-day chip; a timed one is drawn as focus time)
   */
  kind?: 'event' | 'task' | 'focus' | 'out-of-office';
  /** a scheduled task's status */
  status?: TaskStatus;
  /** the event is tentative, or you answered "maybe": dashed at 70% */
  tentative?: boolean;
  /** you declined: dimmed */
  declined?: boolean;
  /** the event has a meeting link: the video icon */
  meeting?: boolean;
}

/** An event as CalendarView hands it to a callback: one occurrence, as drawn. */
export interface CalendarViewEvent {
  id: string;
  /** the series it belongs to, for a series' occurrences and occurrence rows */
  groupId: string;
  title: string;
  /** where this occurrence starts: for an expanded series, its start in the series */
  start: Date;
  end: Date | null;
  allDay: boolean;
  /** the event's `extendedProps`: the display hints and whatever the adapter put beside them */
  props: CalendarViewEventProps & Record<string, unknown>;
}

export interface CalendarViewSelection {
  start: Date;
  /** exclusive; a click selects one 15-minute slot, or one day in the month and all-day row */
  end: Date;
  allDay: boolean;
}

export interface CalendarViewHandle {
  /** FullCalendar's API, for `refetchEvents()` when the data changes */
  getApi(): CalendarApi;
}

export interface CalendarViewProps {
  view: CalendarViewMode;
  /** a day in the range shown: the week, the day or the month */
  date: Date;
  /** FullCalendar event sources, one per visible calendar, coloured by it */
  eventSources: EventSourceInput[];
  /** the first column: 1 for Monday (default), 0 for Sunday */
  firstDay?: 0 | 1;
  timeFormat?: TimeFormat;
  /** leaves Saturday and Sunday out */
  hideWeekends?: boolean;
  /** the current time (the red line, today's disc); defaults to the clock */
  now?: Date;
  /** the first and last hour drawn by the week and day views (0 and 24) */
  startHour?: number;
  endHour?: number;
  /** the hour the week and day views scroll to (8) */
  scrollToHour?: number;
  /** events listed in a month day before "+N more" (3) */
  maxEvents?: number;
  /** the event shown as selected (its sheet is open) */
  selectedEventId?: string;
  /** the label of the all-day row's gutter */
  allDayLabel?: ReactNode;
  onEventClick?: (event: CalendarViewEvent, info: EventClickArg) => void;
  /** a range dragged (or a slot clicked) on empty grid */
  onSelect?: (selection: CalendarViewSelection) => void;
  /** a month date or "+N more": opens that day */
  onDayClick?: (day: Date) => void;
  /** while event sources fetch: show the skeleton */
  onLoading?: (loading: boolean) => void;
  className?: string;
  style?: CSSProperties;
}

/**
 * The calendar's week, day and month views: FullCalendar, drawn as the design system. Timed events
 * are `EventBlock`s (compact under 40px), all-day ones `AllDayEvent` chips, month events one line
 * each. Presentational: the page passes the event sources and drives `view` and `date`.
 */
export const CalendarView = forwardRef<CalendarViewHandle, CalendarViewProps>(function CalendarView(
  {
    view,
    date,
    eventSources,
    firstDay = 1,
    timeFormat = '12',
    hideWeekends = false,
    now,
    startHour = 0,
    endHour = 24,
    scrollToHour = 8,
    maxEvents = 3,
    selectedEventId,
    allDayLabel = 'All day',
    onEventClick,
    onSelect,
    onDayClick,
    onLoading,
    className,
    style,
  },
  ref,
) {
  const calendarRef = useRef<FullCalendar>(null);
  useImperativeHandle(ref, () => ({ getApi: () => calendarRef.current!.getApi() }), []);

  // `initialView` and `initialDate` are read once: later changes go through the API
  const mounted = useRef(false);
  const time = date.getTime();
  useEffect(() => {
    if (!mounted.current) {
      mounted.current = true;
      return;
    }
    calendarRef.current?.getApi().changeView(FULLCALENDAR_VIEW[view], new Date(time));
  }, [view, time]);

  const eventContent = useCallback(
    (arg: EventContentArg) => <EventContent arg={arg} timeFormat={timeFormat} />,
    [timeFormat],
  );

  const eventClassNames = useCallback(
    ({ event }: EventContentArg) => {
      const hints = event.extendedProps as CalendarViewEventProps;
      return cn(
        styles.event,
        hints.declined && styles.declined,
        selectedEventId != null && event.id === selectedEventId && styles.selected,
      ).split(' ');
    },
    [selectedEventId],
  );

  const handleSelect = useCallback(
    (info: DateSelectArg) => {
      onSelect?.({ start: info.start, end: info.end, allDay: info.allDay });
      info.view.calendar.unselect();
    },
    [onSelect],
  );

  const handleEventClick = useCallback(
    (info: EventClickArg) => {
      const { event } = info;
      info.jsEvent.preventDefault();
      onEventClick?.(
        {
          id: event.id,
          groupId: event.groupId,
          title: event.title,
          start: event.start!,
          end: event.end,
          allDay: event.allDay,
          props: event.extendedProps as CalendarViewEvent['props'],
        },
        info,
      );
    },
    [onEventClick],
  );

  const handleMoreLinkClick = useCallback(
    (arg: MoreLinkArg) => {
      onDayClick?.(arg.date);
      // stay in the view shown (the date is already in it): the page moves to the day
      return arg.view.type;
    },
    [onDayClick],
  );

  return (
    <div
      className={cn(styles.view, className)}
      style={{ ...style, '--calendar-weeks': weeksInMonth(date, firstDay) } as CSSProperties}
      data-view={view}
    >
      <FullCalendar
        ref={calendarRef}
        plugins={PLUGINS}
        initialView={FULLCALENDAR_VIEW[view]}
        initialDate={date}
        timeZone="local"
        headerToolbar={false}
        height="100%"
        firstDay={firstDay}
        weekends={!hideWeekends}
        now={now}
        nowIndicator
        eventSources={eventSources}
        editable={false}
        selectable={onSelect != null}
        selectMirror={false}
        select={handleSelect}
        eventClick={onEventClick ? handleEventClick : undefined}
        eventInteractive={onEventClick != null}
        navLinks={onDayClick != null}
        navLinkDayClick={onDayClick ? (day) => onDayClick(day) : undefined}
        moreLinkClick={onDayClick ? handleMoreLinkClick : 'popover'}
        loading={onLoading}
        // the week and day views: one 48px row per hour
        slotDuration="01:00:00"
        snapDuration="00:15:00"
        slotMinTime={`${String(startHour).padStart(2, '0')}:00:00`}
        slotMaxTime={`${String(endHour).padStart(2, '0')}:00:00`}
        scrollTime={`${String(scrollToHour).padStart(2, '0')}:00:00`}
        scrollTimeReset={false}
        slotEventOverlap={false}
        // 16px drawn, inside 1px either side
        eventMinHeight={18}
        eventShortHeight={COMPACT_BELOW}
        allDayContent={allDayLabel}
        slotLabelContent={(arg: SlotLabelContentArg) => formatHour(arg.date.getHours(), timeFormat)}
        eventTimeFormat={{ hour: 'numeric', minute: '2-digit', hour12: timeFormat === '12' }}
        dayHeaderContent={(arg: DayHeaderContentArg) => <DayHeader arg={arg} />}
        nowIndicatorContent={(arg: NowIndicatorContentArg) =>
          arg.isAxis ? null : <NowIndicator className={styles.now} />
        }
        // the month view: five or six weeks that fill the height
        fixedWeekCount={false}
        dayMaxEvents={maxEvents}
        dayCellContent={(arg: DayCellContentArg) => <DayNumber arg={arg} />}
        moreLinkContent={(arg: MoreLinkContentArg) => `+${arg.num} more`}
        views={{ dayGridMonth: { expandRows: true } }}
        eventDisplay="block"
        eventContent={eventContent}
        eventClassNames={eventClassNames}
      />
    </div>
  );
});

// the weeks the month view shows: five or six (four for a February that fits)
function weeksInMonth(date: Date, firstDay: number): number {
  const first = new Date(date.getFullYear(), date.getMonth(), 1);
  const days = new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate();
  const lead = (first.getDay() - firstDay + 7) % 7;
  return Math.ceil((lead + days) / 7);
}

function EventContent({ arg, timeFormat }: { arg: EventContentArg; timeFormat: TimeFormat }) {
  const { event } = arg;
  const hints = event.extendedProps as CalendarViewEventProps;
  const color = arg.backgroundColor || undefined;
  const neutral = hints.kind === 'out-of-office' || hints.kind === 'focus';
  const start = event.start!;
  const end = event.end ?? new Date(start.getTime() + 60 * 60 * 1000);

  if (arg.view.type === 'dayGridMonth') {
    return (
      <span
        className={cn(styles.line, hints.tentative && styles.tentative, neutral && styles.neutral)}
      >
        <ColourBar color={neutral ? 'var(--muted-foreground)' : color} />
        {!event.allDay && arg.isStart && (
          <span className={styles.lineTime}>{formatShortTime(start, timeFormat)}</span>
        )}
        <span className={styles.lineTitle}>{event.title}</span>
      </span>
    );
  }

  if (event.allDay) {
    return (
      <AllDayEvent
        title={event.title}
        color={color}
        kind={hints.kind === 'out-of-office' ? 'out-of-office' : 'event'}
        tabIndex={-1}
        className={styles.chip}
      />
    );
  }

  const height = ((end.getTime() - start.getTime()) / 3_600_000) * HOUR_HEIGHT - 2;
  const compact = height < COMPACT_BELOW;
  const range = formatTimeRange(start, end, timeFormat);
  return (
    <EventBlock
      title={event.title}
      time={compact ? undefined : hints.tentative ? `${range} · Maybe` : range}
      color={color}
      kind={hints.kind === 'out-of-office' ? 'focus' : (hints.kind ?? 'event')}
      status={hints.status}
      tentative={hints.tentative}
      meeting={!compact && hints.meeting}
      size={compact ? 'compact' : 'default'}
      tabIndex={-1}
      className={styles.block}
    />
  );
}

function DayHeader({ arg }: { arg: DayHeaderContentArg }) {
  const weekday = <span className={styles.weekday}>{WEEKDAY.format(arg.date)}</span>;
  if (arg.view.type === 'dayGridMonth') return weekday;
  return (
    <span className={styles.dayHead}>
      {weekday}
      <span className={cn(styles.date, arg.isToday && styles.today)}>{arg.date.getDate()}</span>
    </span>
  );
}

function DayNumber({ arg }: { arg: DayCellContentArg }) {
  if (arg.view.type !== 'dayGridMonth') return null;
  return (
    <span
      className={cn(styles.dayNumber, arg.isToday && styles.today, arg.isOther && styles.outside)}
    >
      {arg.date.getDate()}
    </span>
  );
}

/**
 * A `CalendarEvent` (the shape the stories and screens describe events in) as FullCalendar input,
 * its colour a swatch name and its kind, status, tentative and meeting in `extendedProps`.
 */
export function calendarEventInput(event: CalendarEvent): EventInput {
  const props: CalendarViewEventProps = {
    kind: event.kind,
    status: event.status,
    tentative: event.tentative,
    meeting: event.meeting,
  };
  // FullCalendar refines every key present, so a missing colour is left out, not undefined
  return {
    id: event.id,
    title: event.title,
    start: event.start,
    end: event.end,
    allDay: event.allDay ?? false,
    ...(event.color && { color: event.color }),
    extendedProps: props,
  };
}
