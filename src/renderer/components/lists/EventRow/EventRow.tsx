import { forwardRef, type ComponentProps, type MouseEvent } from 'react';
import { Video } from 'lucide-react';
import { cn } from '../../lib/cn';
import { Button } from '../../ui/Button';
import { ColourBar } from '../../ui/ColourBar';
import type { Swatch } from '../../types';
import styles from './EventRow.module.css';

export interface EventRowEvent {
  title: string;
  /** "10:00 AM – 10:30 AM", after the title; Home leaves it out */
  time?: string;
  /** how it repeats: "Weekly" */
  repeats?: string;
  /** it has a meeting link: shows "Join" (Home: only from 5 minutes before the start to the end) */
  meeting?: boolean;
  /** when, at the right: "In 12 min", "Now", "10:30", "Tue 9:30" */
  relative: string;
  /** colours `relative`: `today` (`date-today`) or `overdue` (`date-overdue`) */
  tone?: 'today' | 'overdue';
  /** the calendar's colour: a swatch name or a CSS colour */
  color?: Swatch | string;
}

export interface EventRowProps extends Omit<ComponentProps<'div'>, 'children'> {
  event: EventRowEvent;
  /** the xs "Join" button, shown when the event has a meeting link */
  onJoin?: () => void;
  /** opens the event (a click on the row, or Enter) */
  onOpen?: () => void;
  /** the next or current meeting: the row is filled with `card` (Home) */
  current?: boolean;
  /** dims the row: tomorrow's first meeting on Home */
  muted?: boolean;
}

/**
 * A calendar event in a list (Home's Meetings, Inbox), on the same strokeless 48px row as
 * `TaskRow`: the calendar's colour bar, the title, time and repeat rule, then "Join" and when it
 * starts. On Home the next or current meeting is `current`, and tomorrow's first is `muted`.
 */
export const EventRow = forwardRef<HTMLDivElement, EventRowProps>(function EventRow(
  { event, onJoin, onOpen, current, muted, className, style, onClick, onKeyDown, ...props },
  ref,
) {
  return (
    <div
      ref={ref}
      role="row"
      tabIndex={onOpen ? 0 : undefined}
      data-current={current ? '' : undefined}
      data-muted={muted ? '' : undefined}
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
        <ColourBar color={event.color ?? 'green'} height={20} className={styles.bar} />
        <span className={styles.title}>{event.title}</span>
        {(event.time || event.repeats) && (
          <span className={styles.time}>
            {[event.time, event.repeats].filter(Boolean).join(' · ')}
          </span>
        )}
      </div>
      <div className={styles.side}>
        {event.meeting && (
          <Button variant="outline" size="xs" icon={Video} onClick={onJoin}>
            Join
          </Button>
        )}
        <span
          className={cn(
            styles.relative,
            event.tone === 'overdue' && styles.soon,
            event.tone === 'today' && styles.today,
          )}
        >
          {event.relative}
        </span>
      </div>
    </div>
  );
});
