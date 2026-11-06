import { forwardRef, type ComponentProps, type MouseEvent } from 'react';
import { Video } from 'lucide-react';
import { cn } from '../../lib/cn';
import { Button } from '../../ui/Button';
import { ColourBar } from '../../ui/ColourBar';
import type { Event } from '@common/types';
import { eventCountdown, eventTimeRange, repeatLabel } from '../../event-text';
import { useFormat } from '../../lib/format';
import { isToday, resolveColor } from '../../types';
import styles from './EventRow.module.css';

/** The fields of core's `Event` an event row reads; pass the event (or an occurrence) as it is. */
export type EventRowData = Pick<
  Event,
  'title' | 'startAt' | 'endAt' | 'allDay' | 'recurrenceRule' | 'meetingUrl' | 'color'
>;

export interface EventRowProps extends Omit<ComponentProps<'div'>, 'children'> {
  event: EventRowData;
  /** the calendar's colour, for an event with none of its own (`event.color` null) */
  calendarColor?: string | null;
  /** the xs "Join" button, shown when the event has a meeting link */
  onJoin?: () => void;
  /** opens the event (a click on the row, or Enter) */
  onOpen?: () => void;
}

/**
 * A calendar event in a list (Home, Inbox), on the same strokeless 48px row as `TaskRow`: the
 * calendar's colour bar, the title, time ("10:00 AM – 10:30 AM") and how it repeats ("Weekly",
 * from its RRULE), then "Join" when it has a meeting link and how soon it is ("In 12m", red
 * from an hour before; "Now" while it runs), all worded from `useFormat()`.
 */
export const EventRow = forwardRef<HTMLDivElement, EventRowProps>(function EventRow(
  { event, calendarColor, onJoin, onOpen, className, style, onClick, onKeyDown, ...props },
  ref,
) {
  const format = useFormat();
  const repeats = repeatLabel(event.recurrenceRule);
  const countdown = eventCountdown(event, format);
  const color = resolveColor(event.color) ?? resolveColor(calendarColor, 'green');
  return (
    <div
      ref={ref}
      role="row"
      tabIndex={onOpen ? 0 : undefined}
      className={cn(styles.row, className)}
      style={style}
      onClick={(e: MouseEvent<HTMLDivElement>) => {
        onClick?.(e);
        if (!e.defaultPrevented && onOpen && !(e.target as Element).closest('button')) onOpen();
      }}
      onKeyDown={(e) => {
        onKeyDown?.(e);
        if (!e.defaultPrevented && e.key === 'Enter' && e.target === e.currentTarget) onOpen?.();
      }}
      {...props}
    >
      <div className={styles.main}>
        <ColourBar color={color} height={20} className={styles.bar} />
        <span className={styles.title}>{event.title}</span>
        <span className={styles.time}>
          {!isToday(event.startAt, format.now) && `${format.formatDue(event.startAt)}, `}
          {eventTimeRange(event, format)}
          {repeats && ` · ${repeats}`}
        </span>
      </div>
      <div className={styles.side}>
        {event.meetingUrl && (
          <Button variant="outline" size="xs" icon={Video} onClick={onJoin}>
            Join
          </Button>
        )}
        <span
          className={cn(
            styles.relative,
            countdown.tone === 'soon' && styles.soon,
            countdown.tone === 'today' && styles.today,
          )}
        >
          {countdown.text}
        </span>
      </div>
    </div>
  );
});
