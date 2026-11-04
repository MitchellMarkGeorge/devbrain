import { forwardRef, useId, type ComponentPropsWithoutRef, type ReactNode } from 'react';
import { cn } from '../../lib/cn';
import { ColourBar } from '../ColourBar';
import { StatusIcon } from '../StatusIcon';
import type { Swatch, TaskStatus } from '../types';
import styles from './CalendarAgenda.module.css';

export interface CalendarAgendaProps extends Omit<ComponentPropsWithoutRef<'section'>, 'title'> {
  /** the day: "Today", "Tomorrow", "Wed, Jun 24" */
  title: ReactNode;
}

/** A day's events and due tasks under a small heading: the calendar page's right panel. */
export const CalendarAgenda = forwardRef<HTMLElement, CalendarAgendaProps>(function CalendarAgenda(
  { title, className, children, ...props },
  ref,
) {
  const id = useId();
  return (
    <section ref={ref} aria-labelledby={id} className={cn(styles.agenda, className)} {...props}>
      <h3 id={id} className={styles.heading}>
        {title}
      </h3>
      <ul className={styles.list}>{children}</ul>
    </section>
  );
});

export interface CalendarAgendaItemProps extends Omit<ComponentPropsWithoutRef<'li'>, 'title'> {
  title: ReactNode;
  /** "9:00 AM", "All day", or "Due" for a task */
  time?: ReactNode;
  /** an event's calendar colour (its bar) */
  color?: Swatch | string;
  /** a task due that day: its status icon replaces the bar */
  status?: TaskStatus;
}

/** One line of the agenda: the event's colour bar (or a task's status), the title and time. */
export const CalendarAgendaItem = forwardRef<HTMLLIElement, CalendarAgendaItemProps>(
  function CalendarAgendaItem({ title, time, color, status, className, ...props }, ref) {
    return (
      <li ref={ref} tabIndex={0} className={cn(styles.item, className)} {...props}>
        <span className={styles.glyph} aria-hidden>
          {status != null ? <StatusIcon status={status} size={16} /> : <ColourBar color={color} />}
        </span>
        <span className={styles.title}>{title}</span>
        {time != null && <span className={styles.time}>{time}</span>}
      </li>
    );
  },
);
