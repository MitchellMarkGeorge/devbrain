import { forwardRef, useMemo, type ComponentPropsWithoutRef, type CSSProperties } from 'react';
import { cn } from '../../lib/cn';
import { ColourBar } from '../ColourBar';
import { addDays, isSameDay, startOfDay, type CalendarEvent } from '../TimeGrid/calendar-events';
import styles from './MonthGrid.module.css';

const WEEKDAY = new Intl.DateTimeFormat('en-US', { weekday: 'short' });

/** "9:30", "10:30", "1:00": the month grid's short start time */
function shortTime(date: Date): string {
  const h = date.getHours() % 12 === 0 ? 12 : date.getHours() % 12;
  return `${h}:${String(date.getMinutes()).padStart(2, '0')}`;
}

export interface MonthGridProps extends Omit<ComponentPropsWithoutRef<'div'>, 'children'> {
  /** any day of the month shown */
  month: Date;
  events: CalendarEvent[];
  /** the current day, drawn on a red disc */
  today?: Date;
  /** the first column: 1 for Monday (default), 0 for Sunday */
  weekStartsOn?: 0 | 1;
  /** events listed in a day before "+N more" (3) */
  maxEvents?: number;
  onEventClick?: (event: CalendarEvent) => void;
  /** "+N more" and a click on the day's number: opens that day */
  onDayClick?: (day: Date) => void;
}

/**
 * The month calendar: a row of weekday names and five or six weeks of equal cells, each with its
 * date (today on a red disc, other months' days dimmed) and up to `maxEvents` one-line events:
 * the calendar's bar, the start time and the title; all-day events first, without a time.
 */
export const MonthGrid = forwardRef<HTMLDivElement, MonthGridProps>(function MonthGrid(
  {
    month,
    events,
    today,
    weekStartsOn = 1,
    maxEvents = 3,
    onEventClick,
    onDayClick,
    className,
    ...props
  },
  ref,
) {
  const weeks = useMemo(() => {
    const first = new Date(month.getFullYear(), month.getMonth(), 1);
    const lead = (first.getDay() - weekStartsOn + 7) % 7;
    const start = addDays(first, -lead);
    const last = new Date(month.getFullYear(), month.getMonth() + 1, 0);
    const count = Math.ceil((lead + last.getDate()) / 7);
    return Array.from({ length: count }, (_, w) =>
      Array.from({ length: 7 }, (_, d) => addDays(start, w * 7 + d)),
    );
  }, [month, weekStartsOn]);

  const eventsOn = (day: Date) => {
    const dayStart = startOfDay(day).getTime();
    const dayEnd = addDays(day, 1).getTime();
    return events
      .filter((e) =>
        e.allDay
          ? e.start.getTime() < dayEnd && e.end.getTime() > dayStart
          : isSameDay(e.start, day),
      )
      .sort(
        (a, b) => Number(!!b.allDay) - Number(!!a.allDay) || a.start.getTime() - b.start.getTime(),
      );
  };

  return (
    <div
      ref={ref}
      className={cn(styles.grid, className)}
      style={{ '--month-weeks': weeks.length } as CSSProperties}
      {...props}
    >
      <div className={styles.weekdays}>
        {weeks[0].map((day) => (
          <div key={day.getDay()} className={styles.weekday}>
            {WEEKDAY.format(day)}
          </div>
        ))}
      </div>
      <div className={styles.weeks}>
        {weeks.flat().map((day) => {
          const inMonth = day.getMonth() === month.getMonth();
          const isToday = today != null && isSameDay(day, today);
          const list = eventsOn(day);
          const shown = list.length > maxEvents ? list.slice(0, maxEvents) : list;
          const more = list.length - shown.length;
          return (
            <div
              key={day.toISOString()}
              className={cn(styles.cell, !inMonth && styles.outside)}
              aria-current={isToday ? 'date' : undefined}
            >
              <button
                type="button"
                className={cn(styles.date, isToday && styles.today)}
                onClick={onDayClick ? () => onDayClick(day) : undefined}
                tabIndex={onDayClick ? 0 : -1}
              >
                {day.getDate()}
              </button>
              {shown.map((event) => (
                <button
                  key={event.id}
                  type="button"
                  className={cn(
                    styles.event,
                    event.tentative && styles.tentative,
                    event.kind === 'out-of-office' && styles.neutral,
                    event.kind === 'focus' && styles.neutral,
                  )}
                  onClick={onEventClick ? () => onEventClick(event) : undefined}
                >
                  <ColourBar
                    color={
                      event.kind === 'out-of-office' || event.kind === 'focus'
                        ? 'var(--muted-foreground)'
                        : event.color
                    }
                  />
                  {!event.allDay && <span className={styles.time}>{shortTime(event.start)}</span>}
                  <span className={styles.title}>{event.title}</span>
                </button>
              ))}
              {more > 0 && (
                <button
                  type="button"
                  className={styles.more}
                  onClick={onDayClick ? () => onDayClick(day) : undefined}
                >
                  +{more} more
                </button>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
});
