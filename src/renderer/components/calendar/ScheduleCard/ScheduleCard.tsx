import { forwardRef, type ComponentPropsWithoutRef } from 'react';
import { Video } from 'lucide-react';
import { cn } from '../../lib/cn';
import { Button } from '../../ui/Button';
import { cardVariants } from '../../ui/Card';
import { ColourBar } from '../../ui/ColourBar';
import type { Swatch } from '../../types';
import styles from './ScheduleCard.module.css';

export interface ScheduleCardProps extends Omit<ComponentPropsWithoutRef<'div'>, 'title'> {
  title: string;
  /** the start time: "9:00 AM" */
  time: string;
  /** how long it runs: "30 mins" (shown when it isn't starting soon) */
  duration?: string;
  /** the time until it starts, when soon: "In 12 min", in `date-today` */
  soon?: string;
  /** the calendar's colour: a swatch name or a CSS colour */
  color?: Swatch | string;
  /** shows an xs "Join" button with a video icon: the event has a meeting link */
  onJoin?: () => void;
}

/**
 * An upcoming event on Home: a 60px card with the calendar's 36px bar, the title and
 * "In 12 min · 9:00 AM", and a "Join" button when it has a meeting link.
 */
export const ScheduleCard = forwardRef<HTMLDivElement, ScheduleCardProps>(function ScheduleCard(
  { title, time, duration, soon, color, onJoin, className, ...props },
  ref,
) {
  const lead = soon ? <span className={styles.soon}>{soon}</span> : duration;
  return (
    <div ref={ref} className={cn(cardVariants(), styles.card, className)} {...props}>
      <ColourBar color={color} height={36} />
      <div className={styles.body}>
        <div className={styles.title}>{title}</div>
        <div className={styles.meta}>
          {lead}
          {lead && <span aria-hidden>·</span>}
          <span>{time}</span>
        </div>
      </div>
      {onJoin && (
        <Button size="xs" icon={Video} onClick={onJoin}>
          Join
        </Button>
      )}
    </div>
  );
});
