import { forwardRef, useId, type ComponentPropsWithoutRef, type ReactNode } from 'react';
import { cn } from '../../lib/cn';
import { ColourBar } from '../../ui/ColourBar';
import { StatusIcon } from '../../entities/StatusIcon';
import type { Event, Task } from '@common/types';
import { useFormat } from '../../lib/format';
import { isOverdue, resolveColor, showsOverdueFlag } from '../../types';
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

/** The fields of core's `Event` an agenda line reads. */
export type AgendaEventData = Pick<Event, 'title' | 'startAt' | 'endAt' | 'allDay' | 'color'>;

/** The fields of core's `Task` an agenda line reads: a task due that day. */
export type AgendaTaskData = Pick<Task, 'title' | 'status' | 'dueDate'>;

export type CalendarAgendaItemProps = Omit<ComponentPropsWithoutRef<'li'>, 'title'> &
  (
    | {
        /** an event (or an occurrence of a series) that day: its colour bar and its start */
        event: AgendaEventData;
        /** the calendar's colour, for an event with none of its own */
        calendarColor?: string | null;
        task?: never;
      }
    | {
        /** a task due that day: its status icon and "Due" */
        task: AgendaTaskData;
        event?: never;
        calendarColor?: never;
      }
  );

/**
 * One line of the agenda, drawn from core's `Event` or `Task`: the event's colour bar (or the
 * task's status icon), the title, and when the event starts ("9:00 AM", "All day") or "Due".
 */
export const CalendarAgendaItem = forwardRef<HTMLLIElement, CalendarAgendaItemProps>(
  function CalendarAgendaItem({ event, task, calendarColor, className, ...props }, ref) {
    const format = useFormat();
    let glyph: ReactNode;
    let time: string;
    if (task) {
      const flag = showsOverdueFlag(task.status, isOverdue(task.status, task.dueDate, format.now));
      glyph = <StatusIcon status={task.status} overdue={flag} size={16} />;
      time = 'Due';
    } else {
      const color = resolveColor(event.color) ?? resolveColor(calendarColor, 'green');
      glyph = <ColourBar color={color} />;
      time = event.allDay ? 'All day' : format.formatTime(event.startAt);
    }
    return (
      <li ref={ref} tabIndex={0} className={cn(styles.item, className)} {...props}>
        <span className={styles.glyph} aria-hidden>
          {glyph}
        </span>
        <span className={styles.title}>{(task ?? event).title}</span>
        <span className={styles.time}>{time}</span>
      </li>
    );
  },
);
