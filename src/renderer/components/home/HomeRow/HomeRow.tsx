import {
  forwardRef,
  type ComponentPropsWithoutRef,
  type KeyboardEvent,
  type MouseEvent,
  type ReactNode,
} from 'react';
import { DateTime } from 'luxon';
import { Video } from 'lucide-react';
import type { Event } from '@common/types';
import { eventCountdown } from '../../event-text';
import { cn } from '../../lib/cn';
import { useFormat } from '../../lib/format';
import { isToday, resolveColor } from '../../types';
import { Button } from '../../ui/Button';
import { ColourBar } from '../../ui/ColourBar';
import styles from './HomeRow.module.css';

export interface HomeRowProps extends Omit<ComponentPropsWithoutRef<'div'>, 'title'> {
  /** the 16px glyph: a calendar's `ColourBar`, a project's folder */
  icon: ReactNode;
  /** the meeting or project, in `foreground-strong` */
  title: ReactNode;
  /** parts before `meta`: Join, a project's bar and "3/12" */
  children?: ReactNode;
  /** the time at the right, 12px in a 72px column: "In 12 min", "10:30", "Due Jul 1" */
  meta?: ReactNode;
  /** colours `meta`: `today` (`date-today`) or `overdue` (`date-overdue`) */
  metaTone?: 'today' | 'overdue';
  /** the next or current meeting: the row is filled with `card` */
  current?: boolean;
  /** dims the row: tomorrow's first meeting */
  muted?: boolean;
  /** opens the item (a click on the row, or Enter) */
  onOpen?: () => void;
}

/**
 * One of Home's minimal rows (meetings, recent projects; a meeting is a `HomeMeetingRow`): 36px, 16px in at the
 * sides, a 16px glyph, the title, then the row's own parts and a quiet time or date at the right.
 */
export const HomeRow = forwardRef<HTMLDivElement, HomeRowProps>(function HomeRow(
  {
    icon,
    title,
    children,
    meta,
    metaTone,
    current,
    muted,
    onOpen,
    className,
    onClick,
    onKeyDown,
    ...props
  },
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
      onClick={(event: MouseEvent<HTMLDivElement>) => {
        onClick?.(event);
        if (event.defaultPrevented || !onOpen) return;
        if (!(event.target as Element).closest('button, a')) onOpen();
      }}
      onKeyDown={(event: KeyboardEvent<HTMLDivElement>) => {
        onKeyDown?.(event);
        if (
          !event.defaultPrevented &&
          event.key === 'Enter' &&
          event.target === event.currentTarget
        )
          onOpen?.();
      }}
      {...props}
    >
      {/* the row's one cell, which a grid's row needs; `display: contents`, so it lays out nothing */}
      <div role="gridcell" className={styles.cell}>
        <span className={styles.icon}>{icon}</span>
        <span className={styles.title}>{title}</span>
        {children}
        {meta != null && (
          <span className={styles.meta} data-tone={metaTone}>
            {meta}
          </span>
        )}
      </div>
    </div>
  );
});

export type HomeRowNoteProps = ComponentPropsWithoutRef<'span'>;

/** Quiet 12px text inside a `HomeRow`: a project's "3/12". */
export const HomeRowNote = forwardRef<HTMLSpanElement, HomeRowNoteProps>(function HomeRowNote(
  { className, ...props },
  ref,
) {
  return <span ref={ref} className={cn(styles.note, className)} {...props} />;
});

/** The fields of core's `Event` a meeting row reads; pass the event (or an occurrence) as it is. */
export type HomeMeetingData = Pick<
  Event,
  'title' | 'startAt' | 'endAt' | 'allDay' | 'meetingUrl' | 'color'
>;

export interface HomeMeetingRowProps extends Omit<
  HomeRowProps,
  'icon' | 'title' | 'meta' | 'metaTone' | 'children'
> {
  event: HomeMeetingData;
  /** the calendar's colour, for an event with none of its own */
  calendarColor?: string | null;
  /**
   * shows the "Join" button, when the event has a meeting link: pass it from 5 minutes before the
   * start until the end
   */
  onJoin?: () => void;
}

/**
 * A meeting in Home's Meetings section, drawn from core's `Event`: the calendar's colour bar, the
 * title, and when it is, from `useFormat()`. The `current` meeting (the next or running one) is
 * filled and counts down ("In 12m", "Now") in
 * `date-today`; later meetings show their start ("10:30 AM"), and another day's its weekday too
 * ("Tue 9:30 AM", dim it with `muted`). With `onJoin` and a meeting link it shows Join.
 */
export const HomeMeetingRow = forwardRef<HTMLDivElement, HomeMeetingRowProps>(
  function HomeMeetingRow({ event, calendarColor, onJoin, current, ...props }, ref) {
    // only the current meeting counts down; the others show a time of day
    const format = useFormat(current ? 'minute' : 'day');
    const color = resolveColor(event.color) ?? resolveColor(calendarColor, 'green');
    const today = isToday(event.startAt, format.now);
    const time = event.allDay ? 'All day' : format.formatTime(event.startAt);
    const meta = current
      ? eventCountdown(event, format).text
      : today
        ? time
        : `${DateTime.fromJSDate(event.startAt).toLocaleString({ weekday: 'short' })} ${time}`;
    return (
      <HomeRow
        ref={ref}
        current={current}
        icon={<ColourBar color={color} />}
        title={event.title}
        meta={meta}
        metaTone={current ? 'today' : undefined}
        {...props}
      >
        {onJoin && event.meetingUrl && (
          <Button size="xs" icon={Video} onClick={onJoin}>
            Join
          </Button>
        )}
      </HomeRow>
    );
  },
);
