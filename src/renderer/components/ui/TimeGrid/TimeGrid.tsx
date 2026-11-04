import {
  forwardRef,
  useLayoutEffect,
  useMemo,
  useRef,
  type ComponentPropsWithoutRef,
  type CSSProperties,
  type ReactNode,
} from 'react';
import { cn } from '../../lib/cn';
import { AllDayEvent, EventBlock, NowIndicator } from '../EventBlock';
import {
  formatHour,
  formatTimeRange,
  hourOfDay,
  isSameDay,
  layoutAllDay,
  layoutOverlaps,
  type CalendarEvent,
} from './calendar-events';
import styles from './TimeGrid.module.css';

/** the space above the first hour line, so its label is not cut off */
const TOP = 8;
/** the gap between an event and its column's edges, and between side-by-side events */
const INSET = 3;
const GAP = 2;
/** the shortest block drawn: a 15-minute event */
const MIN_HEIGHT = 16;

const WEEKDAY = new Intl.DateTimeFormat('en-US', { weekday: 'short' });

export interface TimeGridProps extends Omit<ComponentPropsWithoutRef<'div'>, 'children'> {
  /** the days shown, one column each: seven for the week view, one for the day view */
  days: Date[];
  events: CalendarEvent[];
  /** the first and last hour lines drawn; the grid scrolls when it is taller than its box */
  startHour?: number;
  endHour?: number;
  /** the hour scrolled to on mount (default `startHour`) */
  scrollToHour?: number;
  /** pixels per hour (48) */
  hourHeight?: number;
  /** the current time: draws the red line in its day's column, and marks that day as today */
  now?: Date;
  /** an event's time line; defaults to "1:00 – 2:00 PM" (" · Maybe" when tentative) */
  formatEventTime?: (event: CalendarEvent) => string;
  onEventClick?: (event: CalendarEvent) => void;
  /** the event shown as selected (its sheet is open) */
  selectedEventId?: string;
  /** the label of the all-day row's gutter */
  allDayLabel?: ReactNode;
}

function defaultEventTime(event: CalendarEvent): string {
  const range = formatTimeRange(event.start, event.end);
  return event.tentative ? `${range} · Maybe` : range;
}

/**
 * The day and week calendar: day headers (today's date on a red disc), the all-day row, and a
 * time grid of 48px hours with a 60px gutter of hour labels. Timed events are placed by their
 * start and end, overlapping events side by side; the red line marks the current time in
 * today's column. Blocks shorter than 40px (30 minutes) switch to the one-line `compact` EventBlock, title only.
 */
export const TimeGrid = forwardRef<HTMLDivElement, TimeGridProps>(function TimeGrid(
  {
    days,
    events,
    startHour = 0,
    endHour = 24,
    scrollToHour,
    hourHeight = 48,
    now,
    formatEventTime = defaultEventTime,
    onEventClick,
    selectedEventId,
    allDayLabel = 'All day',
    className,
    style,
    ...props
  },
  ref,
) {
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const columns = days.length;
  const hours = endHour - startHour;

  const { allDay, timed } = useMemo(() => {
    const allDayEvents = events.filter((e) => e.allDay);
    const perDay = days.map((day) =>
      layoutOverlaps(events.filter((e) => !e.allDay && isSameDay(e.start, day))),
    );
    return {
      allDay: days.length > 0 ? layoutAllDay(allDayEvents, days[0], days.length) : [],
      timed: perDay,
    };
  }, [days, events]);
  const allDayLanes = allDay.reduce((n, p) => Math.max(n, p.lane + 1), 1);

  useLayoutEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const hour = scrollToHour ?? startHour;
    el.scrollTop = Math.max(0, (hour - startHour) * hourHeight);
    // set once, on mount
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const gridColumns = `var(--time-grid-gutter) repeat(${columns}, minmax(0, 1fr))`;
  const y = (hour: number) => TOP + (hour - startHour) * hourHeight;

  return (
    <div
      ref={(node) => {
        scrollRef.current = node;
        if (typeof ref === 'function') ref(node);
        else if (ref) ref.current = node;
      }}
      className={cn(styles.grid, className)}
      style={{ ...style, '--time-grid-columns': gridColumns } as CSSProperties}
      {...props}
    >
      <div className={styles.sticky}>
        <div className={styles.head}>
          <div className={styles.gutter} />
          {days.map((day) => {
            const today = now != null && isSameDay(day, now);
            return (
              <div
                key={day.toISOString()}
                className={styles.dayHead}
                aria-current={today ? 'date' : undefined}
              >
                <span className={styles.weekday}>{WEEKDAY.format(day)}</span>
                <span className={cn(styles.date, today && styles.today)}>{day.getDate()}</span>
              </div>
            );
          })}
        </div>
        <div className={styles.allDay} style={{ gridTemplateRows: `repeat(${allDayLanes}, 22px)` }}>
          <div className={styles.allDayLabel}>{allDayLabel}</div>
          {days.map((day, i) => (
            <div
              key={day.toISOString()}
              className={styles.allDayCell}
              style={{ gridColumn: i + 2 }}
            />
          ))}
          {allDay.map(({ event, first, last, lane }) => (
            <AllDayEvent
              key={event.id}
              title={event.title}
              color={event.color}
              kind={event.kind === 'out-of-office' ? 'out-of-office' : 'event'}
              className={styles.allDayEvent}
              style={{ gridColumn: `${first + 2} / ${last + 3}`, gridRow: lane + 1 }}
              data-selected={selectedEventId === event.id || undefined}
              onClick={onEventClick ? () => onEventClick(event) : undefined}
            />
          ))}
        </div>
      </div>

      <div className={styles.body} style={{ minHeight: TOP + hours * hourHeight + TOP * 2 }}>
        <div className={styles.labels}>
          {Array.from({ length: hours + 1 }, (_, i) => (
            <span key={i} className={styles.hourLabel} style={{ top: y(startHour + i) - 8 }}>
              {formatHour(startHour + i)}
            </span>
          ))}
        </div>
        <div className={styles.lines} aria-hidden>
          {Array.from({ length: hours + 1 }, (_, i) => (
            <span key={i} className={styles.hourLine} style={{ top: y(startHour + i) }} />
          ))}
        </div>
        {days.map((day, i) => {
          const showNow =
            now != null &&
            isSameDay(day, now) &&
            hourOfDay(now) >= startHour &&
            hourOfDay(now) <= endHour;
          return (
            <div key={day.toISOString()} className={styles.column} style={{ gridColumn: i + 2 }}>
              {timed[i].map(({ event, lane, lanes }) => {
                const from = Math.max(startHour, hourOfDay(event.start));
                const endsNextDay = !isSameDay(event.start, event.end);
                const to = Math.min(endHour, endsNextDay ? 24 : hourOfDay(event.end));
                if (to <= startHour || from >= endHour) return null;
                const height = Math.max(MIN_HEIGHT, (to - from) * hourHeight - GAP);
                const compact = height < 40;
                const kind = event.kind === 'out-of-office' ? 'focus' : (event.kind ?? 'event');
                return (
                  <EventBlock
                    key={event.id}
                    title={event.title}
                    time={compact ? undefined : formatEventTime(event)}
                    color={event.color}
                    kind={kind}
                    status={event.status}
                    tentative={event.tentative}
                    meeting={!compact && event.meeting}
                    size={compact ? 'compact' : 'default'}
                    role={onEventClick ? 'button' : undefined}
                    data-selected={selectedEventId === event.id || undefined}
                    onClick={onEventClick ? () => onEventClick(event) : undefined}
                    className={styles.event}
                    style={{
                      top: y(from) + 1,
                      height,
                      left: `calc(${INSET}px + (100% - ${2 * INSET + GAP * (lanes - 1)}px) * ${lane / lanes} + ${lane * GAP}px)`,
                      width: `calc((100% - ${2 * INSET + GAP * (lanes - 1)}px) / ${lanes})`,
                    }}
                  />
                );
              })}
              {showNow && (
                <div className={styles.now} style={{ top: y(hourOfDay(now)) }}>
                  <NowIndicator />
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
});
