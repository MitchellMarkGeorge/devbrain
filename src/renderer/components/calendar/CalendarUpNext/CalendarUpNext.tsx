import { forwardRef, type ComponentPropsWithoutRef } from 'react';
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
  ComponentPropsWithoutRef<'div'>,
  'title' | 'children'
> {
  /** the next timed event today, or the one in progress */
  event: UpNextEventData;
  /** the calendar's colour, for an event with none of its own */
  calendarColor?: string | null;
  /** "Join", shown when the event has a meeting link */
  onJoin?: () => void;
  /** opens the event: the title is a button for it, its click area the whole card */
  onOpen?: () => void;
}

/**
 * The calendar panel's next meeting, above the agenda: "Up next" (or "Now" while it runs), the
 * calendar's colour bar and the title, how soon it starts ("In 12m", `date-today` from an hour
 * before) and its time, then "Join" when it has a meeting link. A `card` with the `edge` outline.
 */
export const CalendarUpNext = forwardRef<HTMLDivElement, CalendarUpNextProps>(
  function CalendarUpNext({ event, calendarColor, onJoin, onOpen, className, ...props }, ref) {
    const format = useFormat('minute');
    const countdown = eventCountdown(event, format);
    const color = resolveColor(event.color) ?? resolveColor(calendarColor, 'green');
    const now = countdown.text === 'Now';
    const title = (
      <>
        <ColourBar color={color} height={16} />
        <span className={styles.titleText}>{event.title}</span>
      </>
    );
    // not a landmark: the "Up next" heading is enough to find it, and the panel is the region
    return (
      <div
        ref={ref}
        className={cn(styles.card, onOpen && styles.interactive, className)}
        data-testid="calendar-up-next"
        {...props}
      >
        <h3 className={styles.heading}>{now ? 'Now' : 'Up next'}</h3>
        {onOpen ? (
          <button type="button" className={cn(styles.title, styles.open)} onClick={onOpen}>
            {title}
          </button>
        ) : (
          <div className={styles.title}>{title}</div>
        )}
        <div className={styles.when}>
          {!now && (
            <span className={cn(countdown.tone === 'soon' && styles.soon)}>
              {countdown.text} ·{' '}
            </span>
          )}
          <span>{eventTimeRange(event, format)}</span>
        </div>
        {event.meetingUrl && (
          <Button variant="outline" size="xs" icon={Video} onClick={onJoin} className={styles.join}>
            Join
          </Button>
        )}
      </div>
    );
  },
);
