import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
  type CSSProperties,
  type ReactNode,
} from 'react';
import FullCalendar, {
  type CalendarApi,
  type CalendarRef,
  type DateSelectInfo,
  type DayCellInfo,
  type DayHeaderInfo,
  type EventClickInfo,
  type EventDisplayInfo,
  type EventInput,
  type EventSourceInput,
} from '@fullcalendar/react';
import dayGridPlugin from '@fullcalendar/react/daygrid';
import interactionPlugin from '@fullcalendar/react/interaction';
import timeGridPlugin from '@fullcalendar/react/timegrid';
import rrulePlugin from '@fullcalendar/rrule';
// FullCalendar's layout only; everything it looks like comes from the classes below
import '@fullcalendar/react/skeleton.css';
import { cn } from '../../lib/cn';
import { ColourBar } from '../../ui/ColourBar';
import type { TaskStatus } from '@common/types';
import type { CalendarEvent } from '../../types';
import { AllDayEvent, EventBlock, NowIndicator } from '../EventBlock';
import { formatHour, formatShortTime, formatTimeRange, type TimeFormat } from '../calendar-events';
import styles from './CalendarView.module.css';

export type CalendarViewMode = 'week' | 'day' | 'month';

const FULLCALENDAR_VIEW: Record<CalendarViewMode, string> = {
  week: 'timeGridWeek',
  day: 'timeGridDay',
  month: 'dayGridMonth',
};

const PLUGINS = [timeGridPlugin, dayGridPlugin, interactionPlugin, rrulePlugin];

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
  onEventClick?: (event: CalendarViewEvent, info: EventClickInfo) => void;
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
 * DevBrain's FullCalendar theme: a class from the CSS module for each part FullCalendar draws,
 * in place of one of its own themes. `skeleton.css` gives the layout and nothing else.
 */
const THEME = {
  className: styles.calendar,
  viewClass: styles.calendarView,
  tableHeaderClass: styles.tableHeader,
  // the week and day views' headers, and the month's weekday row
  dayHeaderRowClass: styles.headerRow,
  dayHeaderClass: styles.dayHeader,
  dayHeaderInnerClass: styles.dayHeaderInner,
  dayHeaderDividerClass: styles.divider,
  dayHeaderAlign: 'start' as const,
  // the all-day row
  allDayHeaderClass: styles.allDayHeader,
  allDayHeaderInnerClass: styles.allDayHeaderInner,
  allDayDividerClass: styles.divider,
  // the hours
  slotHeaderRowClass: styles.slotRow,
  slotHeaderClass: styles.slotHeader,
  // the first hour's line is the all-day row's, at the top of the scroller: its label would be cut
  slotHeaderInnerClass: (info: { isFirst: boolean }) =>
    cn(styles.slotHeaderInner, info.isFirst && styles.hidden),
  slotHeaderDividerClass: styles.slotHeaderDivider,
  slotLaneClass: styles.slotLane,
  dayLaneClass: styles.dayLane,
  dayLaneInnerClass: styles.dayLaneInner,
  nowIndicatorHeaderClass: styles.hidden,
  nowIndicatorLineClass: styles.nowLine,
  // the month's weeks and cells, and the all-day row's cells
  dayRowClass: styles.dayRow,
  dayCellClass: styles.dayCell,
  dayCellInnerClass: styles.dayCellInner,
  dayCellTopClass: styles.dayCellTop,
  dayCellBottomClass: styles.dayCellBottom,
  fillerClass: styles.filler,
  // events: FullCalendar's own frame is bare, the content draws the event
  blockEventClass: styles.blockEvent,
  blockEventInnerClass: styles.eventInner,
  rowEventClass: styles.rowEvent,
  rowEventInnerClass: styles.eventInner,
  columnEventClass: styles.columnEvent,
  columnEventInnerClass: styles.eventInner,
  listItemEventClass: styles.rowEvent,
  listItemEventInnerClass: styles.eventInner,
  moreLinkClass: styles.moreLink,
  rowMoreLinkClass: styles.rowMoreLink,
  navLinkClass: styles.navLink,
  highlightClass: styles.highlight,
  popoverClass: styles.popover,
};

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
  const calendarRef = useRef<CalendarRef>(null);
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
    (arg: EventDisplayInfo) => <EventContent arg={arg} timeFormat={timeFormat} />,
    [timeFormat],
  );

  const eventClass = useCallback(
    ({ event }: EventDisplayInfo) => {
      const hints = event.extendedProps as CalendarViewEventProps;
      return cn(
        styles.event,
        hints.declined && styles.declined,
        selectedEventId != null && event.id === selectedEventId && styles.selected,
      );
    },
    [selectedEventId],
  );

  const handleSelect = useCallback(
    (info: DateSelectInfo) => {
      onSelect?.({ start: info.start, end: info.end, allDay: info.allDay });
      info.view.calendar.unselect();
    },
    [onSelect],
  );

  const handleEventClick = useCallback(
    (info: EventClickInfo) => {
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
    (arg: { date: Date; view: { type: string } }) => {
      onDayClick?.(arg.date);
      // stay in the view shown (the date is already in it): the page moves to the day
      return arg.view.type;
    },
    [onDayClick],
  );

  return (
    <div className={cn(styles.view, className)} style={style} data-view={view}>
      <FullCalendar
        ref={calendarRef}
        plugins={PLUGINS}
        initialView={FULLCALENDAR_VIEW[view]}
        initialDate={date}
        timeZone="local"
        headerToolbar={false}
        height="100%"
        borderless
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
        navLinkDayClick={onDayClick ? (day: Date) => onDayClick(day) : undefined}
        moreLinkClick={onDayClick ? handleMoreLinkClick : 'popover'}
        loading={onLoading}
        // the week and day views: one 48px row per hour
        slotDuration="01:00:00"
        snapDuration="00:15:00"
        slotMinHeight={HOUR_HEIGHT}
        slotMinTime={`${String(startHour).padStart(2, '0')}:00:00`}
        slotMaxTime={`${String(endHour).padStart(2, '0')}:00:00`}
        scrollTime={`${String(scrollToHour).padStart(2, '0')}:00:00`}
        scrollTimeReset={false}
        slotEventOverlap={false}
        // 16px drawn, inside its 1px margins
        eventMinHeight={18}
        eventShortHeight={COMPACT_BELOW}
        allDayText={typeof allDayLabel === 'string' ? allDayLabel : undefined}
        allDayHeaderContent={allDayLabel}
        slotHeaderContent={(arg: { date: Date }) => formatHour(arg.date.getHours(), timeFormat)}
        eventTimeFormat={{ hour: 'numeric', minute: '2-digit', hour12: timeFormat === '12' }}
        dayHeaderContent={(arg: DayHeaderInfo) => <DayHeader arg={arg} />}
        nowIndicatorLineContent={() => <NowIndicator className={styles.now} />}
        // the month view: five or six weeks that fill the height
        fixedWeekCount={false}
        dayMaxEvents={maxEvents}
        dayCellTopContent={(arg: DayCellInfo) => <DayNumber arg={arg} />}
        moreLinkContent={(arg: { num: number }) => `+${arg.num} more`}
        views={{ dayGridMonth: { expandRows: true } }}
        eventDisplay="block"
        eventContent={eventContent}
        eventClass={eventClass}
        {...THEME}
      />
    </div>
  );
});

function EventContent({ arg, timeFormat }: { arg: EventDisplayInfo; timeFormat: TimeFormat }) {
  const { event } = arg;
  const hints = event.extendedProps as CalendarViewEventProps;
  const color = arg.color || undefined;
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

function DayHeader({ arg }: { arg: DayHeaderInfo }) {
  const weekday = <span className={styles.weekday}>{WEEKDAY.format(arg.date)}</span>;
  if (arg.view.type === 'dayGridMonth') return weekday;
  return (
    <span className={styles.dayHead}>
      {weekday}
      <span className={cn(styles.date, arg.isToday && styles.today)}>{arg.date.getDate()}</span>
    </span>
  );
}

function DayNumber({ arg }: { arg: DayCellInfo }) {
  if (arg.view.type !== 'dayGridMonth') return null;
  // `arg.date` is FullCalendar's own marker (the local date written as UTC): use its text
  return (
    <span
      className={cn(styles.dayNumber, arg.isToday && styles.today, arg.isOther && styles.outside)}
    >
      {arg.dayNumberText}
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
