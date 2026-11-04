import { forwardRef, type ComponentPropsWithoutRef, type CSSProperties } from 'react';
import { cn } from '../../lib/cn';
import { Button } from '../Button';
import { cardVariants } from '../Card';
import { resolveColor, type Swatch } from '../types';
import styles from './ScheduleCard.module.css';

export interface ScheduleCardProps extends Omit<ComponentPropsWithoutRef<'div'>, 'title'> {
  title: string;
  /** the start time: "9:00 AM" */
  time: string;
  /** how long it runs: "30 mins" (shown when it isn't starting soon) */
  duration?: string;
  /** the time until it starts, when soon: "12 mins", in `date-today` */
  soon?: string;
  /** the calendar's colour: a swatch name or a CSS colour */
  color?: Swatch | string;
  /** shows an xs "Join" button: the event has a meeting link */
  onJoin?: () => void;
}

/**
 * An upcoming event on Home: a compact card with the calendar's bar, the title, "12 mins ·
 * 9:00 AM" and a "Join" button when it has a meeting link.
 */
export const ScheduleCard = forwardRef<HTMLDivElement, ScheduleCardProps>(function ScheduleCard(
  { title, time, duration, soon, color, onJoin, className, ...props },
  ref,
) {
  const lead = soon ? <span className={styles.soon}>{soon}</span> : duration;
  return (
    <div
      ref={ref}
      className={cn(cardVariants({ size: 'compact' }), styles.card, className)}
      {...props}
    >
      <span
        className={styles.bar}
        style={{ '--bar-color': resolveColor(color) } as CSSProperties}
      />
      <div className={styles.body}>
        <div className={styles.title}>{title}</div>
        <div className={styles.meta}>
          {lead}
          {lead && ' · '}
          {time}
        </div>
      </div>
      {onJoin && (
        <Button size="xs" onClick={onJoin}>
          Join
        </Button>
      )}
    </div>
  );
});
