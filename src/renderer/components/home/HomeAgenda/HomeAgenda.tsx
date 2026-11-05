import { forwardRef, type ComponentPropsWithoutRef, type ReactNode } from 'react';
import { cn } from '../../lib/cn';
import styles from './HomeAgenda.module.css';

export interface HomeAgendaSectionProps extends Omit<ComponentPropsWithoutRef<'section'>, 'title'> {
  /** "Later today", "Tomorrow", "Later this week" */
  title: ReactNode;
  /** a quiet count at the right: "3 meetings" */
  aside?: ReactNode;
  /** days instead of times in the first column ("Wed 24"): a 56px column instead of 40px */
  days?: boolean;
}

/**
 * A block of Home's right column (not the calendar page's `CalendarAgenda`, which lists one day's
 * items title-first): times or days in a first column, "+n" counts, empty slots, and a count in
 * the heading. a 12px heading (and a count), then its `HomeAgendaRow`s. Blocks
 * are separated by `HomeAgendaDivider`s.
 */
export const HomeAgendaSection = forwardRef<HTMLElement, HomeAgendaSectionProps>(
  function HomeAgendaSection({ title, aside, days, className, children, ...props }, ref) {
    return (
      <section
        ref={ref}
        data-days={days ? '' : undefined}
        className={cn(styles.section, className)}
        {...props}
      >
        <header className={styles.heading}>
          <h3 className={styles.title}>{title}</h3>
          {aside && <span className={styles.aside}>{aside}</span>}
        </header>
        {children}
      </section>
    );
  },
);

export interface HomeAgendaRowProps extends Omit<ComponentPropsWithoutRef<'button'>, 'title'> {
  /** "10:30", "Due", "Wed 24", "Weekend" */
  time: ReactNode;
  /** a `ColourBar` (an event) or a 12px `StatusIcon` (a task due) */
  glyph?: ReactNode;
  /** what it is; ends in "…" at its width */
  title: ReactNode;
  /** more on that day: "+1" */
  more?: ReactNode;
  /** an empty slot ("Nothing planned"): quiet, not clickable */
  empty?: boolean;
}

/** One line of the agenda: a 32px row with the time, the event's bar or the task's status, the title and "+n". */
export const HomeAgendaRow = forwardRef<HTMLButtonElement, HomeAgendaRowProps>(
  function HomeAgendaRow({ time, glyph, title, more, empty, className, ...props }, ref) {
    return (
      <button
        ref={ref}
        type="button"
        disabled={empty}
        data-empty={empty ? '' : undefined}
        className={cn(styles.row, className)}
        {...props}
      >
        <span className={styles.time}>{time}</span>
        {glyph && <span className={styles.glyph}>{glyph}</span>}
        <span className={styles.rowTitle}>{title}</span>
        {more && <span className={styles.more}>{more}</span>}
      </button>
    );
  },
);

/** A quiet line in place of rows: "Nothing scheduled and nothing due." */
export function HomeAgendaEmpty({ className, ...props }: ComponentPropsWithoutRef<'p'>) {
  return <p className={cn(styles.empty, className)} {...props} />;
}

/** The 1px line between agenda blocks, 20px above and below. */
export function HomeAgendaDivider({ className, ...props }: ComponentPropsWithoutRef<'hr'>) {
  return <hr className={cn(styles.divider, className)} {...props} />;
}

export interface HomeAgendaNoticeProps extends Omit<ComponentPropsWithoutRef<'div'>, 'title'> {
  /** a 20px provider tile */
  icon?: ReactNode;
  title: ReactNode;
  description?: ReactNode;
  /** a full-width `sm` button: "Reconnect" */
  action?: ReactNode;
}

/**
 * A card at the foot of Home's right column about the agenda's source: "Google Calendar paused",
 * why, and the fix.
 */
export const HomeAgendaNotice = forwardRef<HTMLDivElement, HomeAgendaNoticeProps>(
  function HomeAgendaNotice({ icon, title, description, action, className, ...props }, ref) {
    return (
      <div ref={ref} className={cn(styles.notice, className)} {...props}>
        <div className={styles.noticeTitle}>
          {icon}
          {title}
        </div>
        {description && <p className={styles.noticeDescription}>{description}</p>}
        {action}
      </div>
    );
  },
);
