import { forwardRef, type ComponentProps, type MouseEvent } from 'react';
import { Video } from 'lucide-react';
import { cn } from '../../lib/cn';
import { Button } from '../Button';
import { ColourBar } from '../ColourBar';
import type { Swatch } from '../types';
import styles from './EventRow.module.css';

export interface EventRowEvent {
  title: string;
  /** "10:00 AM – 10:30 AM" */
  time: string;
  /** how it repeats: "Weekly" */
  repeats?: string;
  /** it has a meeting link: shows "Join" */
  meeting?: boolean;
  /** the time until it starts: "In 12 min", "In 3h" */
  relative: string;
  /** `overdue` under an hour (red), `today` later today */
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
}

/**
 * A calendar event in a list (Home, Inbox), on the same strokeless 48px row as `TaskRow`: the
 * calendar's colour bar, the title, time and repeat rule, then "Join" and the time until it starts.
 */
export const EventRow = forwardRef<HTMLDivElement, EventRowProps>(function EventRow(
  { event, onJoin, onOpen, className, style, onClick, onKeyDown, ...props },
  ref,
) {
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
        <ColourBar color={event.color ?? 'green'} height={20} className={styles.bar} />
        <span className={styles.title}>{event.title}</span>
        <span className={styles.time}>
          {event.time}
          {event.repeats && ` · ${event.repeats}`}
        </span>
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
