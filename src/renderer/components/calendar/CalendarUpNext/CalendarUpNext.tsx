import { forwardRef, useId, type ComponentPropsWithoutRef, type MouseEvent } from 'react';
import { Video } from 'lucide-react';
import type { Event } from '@common/types';
import { cn } from '../../lib/cn';
import { Button } from '../../ui/Button';
import { ColourBar } from '../../ui/ColourBar';
import { eventCountdown, eventTimeRange } from '../../event-text';
import { useFormat } from '../../lib/format';
import { resolveColor } from '../../types';
import styles from './CalendarUpNext.module.css';

/** The fields of core's `Event` the card reads; pass the occurrence as it is. */
export type UpNextEventData = Pick<
  Event,
  'title' | 'startAt' | 'endAt' | 'allDay' | 'meetingUrl' | 'color'
>;

export interface CalendarUpNextProps extends Omit<
  ComponentPropsWithoutRef<'section'>,
  'title' | 'children'
> {
  /** the next timed event today, or the one in progress */
  event: UpNextEventData;
  /** the calendar's colour, for an event with none of its own */
  calendarColor?: string | null;
  /** "Join", shown when the event has a meeting link */
  onJoin?: () => void;
  /** opens the event: a click on the card, or Enter */
  onOpen?: () => void;
}

/**
 * The calendar panel's next meeting, above the agenda: "Up next" (or "Now" while it runs), the
 * calendar's colour bar and the title, how soon it starts ("In 12m", `date-today` from an hour
 * before) and its time, then "Join" when it has a meeting link. A `card` with the `edge` outline.
 */
export const CalendarUpNext = forwardRef<HTMLElement, CalendarUpNextProps>(function CalendarUpNext(
  { event, calendarColor, onJoin, onOpen, className, ...props },
  ref,
) {
  const id = useId();
  const format = useFormat('minute');
  const countdown = eventCountdown(event, format);
  const color = resolveColor(event.color) ?? resolveColor(calendarColor, 'green');
  const now = countdown.text === 'Now';
  return (
    <section
      ref={ref}
      aria-labelledby={id}
      className={cn(styles.card, onOpen && styles.interactive, className)}
      tabIndex={onOpen ? 0 : undefined}
      onClick={(e: MouseEvent<HTMLElement>) => {
        if (onOpen && !(e.target as Element).closest('button')) onOpen();
      }}
      onKeyDown={(e) => {
        if (onOpen && e.key === 'Enter' && e.target === e.currentTarget) onOpen();
      }}
      data-testid="calendar-up-next"
      {...props}
    >
      <h3 className={styles.heading}>{now ? 'Now' : 'Up next'}</h3>
      <div className={styles.title} id={id}>
        <ColourBar color={color} height={16} />
        <span className={styles.titleText}>{event.title}</span>
      </div>
      <div className={styles.when}>
        {!now && (
          <span className={cn(countdown.tone === 'soon' && styles.soon)}>{countdown.text} · </span>
        )}
        <span>{eventTimeRange(event, format)}</span>
      </div>
      {event.meetingUrl && (
        <Button variant="outline" size="xs" icon={Video} onClick={onJoin} className={styles.join}>
          Join
        </Button>
      )}
    </section>
  );
});
