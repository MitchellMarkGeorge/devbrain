import {
  forwardRef,
  type ComponentPropsWithoutRef,
  type CSSProperties,
  type ReactNode,
} from 'react';
import { cn } from '../../lib/cn';
import { renderIcon, type IconSource } from '../../ui/Icon';
import { resolveColor, type Swatch } from '../../types';
import styles from './UpNextStrip.module.css';

export interface UpNextStripProps extends Omit<ComponentPropsWithoutRef<'div'>, 'title'> {
  /**
   * `meeting`: the next meeting within the hour (title, countdown, time, its note, Join).
   * `free`: no meeting soon: how long you are free, what comes next, and a task that fits.
   */
  state: 'meeting' | 'free';
  /** the meeting's title, or how long you're free: "Until 1:00 PM", "All day" */
  title: ReactNode;
  /** the meeting's calendar colour: a 24px bar before the title */
  color?: Swatch | string;
  /** "In 12 min" (`date-today`), or the free time left: "1h 40m" (`status-in-progress`) */
  countdown?: ReactNode;
  /** the meeting's time: "9:00 – 10:00 AM" */
  time?: ReactNode;
  /** the meeting's note, as an `EntityPill` */
  note?: ReactNode;
  /** free: what comes next, after a dot: "Design Review next", with its calendar colour */
  next?: ReactNode;
  nextColor?: Swatch | string;
  /** free: a task that fits the gap, after "Good time for" */
  suggestion?: ReactNode;
  /** the suggestion's status glyph (a `StatusIcon`, 14px) */
  suggestionIcon?: IconSource;
  /** the action at the right: "Join" (an `sm` default button with a video icon) */
  action?: ReactNode;
}

/**
 * Home's strip under the greeting: what's coming up. A 56px card with a status dot and "Up next"
 * or "Free", then the meeting (or the free time) and its details; the action at the right.
 * Hidden on days with no meetings.
 */
export const UpNextStrip = forwardRef<HTMLDivElement, UpNextStripProps>(function UpNextStrip(
  {
    state,
    title,
    color,
    countdown,
    time,
    note,
    next,
    nextColor,
    suggestion,
    suggestionIcon,
    action,
    className,
    ...props
  },
  ref,
) {
  const meeting = state === 'meeting';
  return (
    <div ref={ref} data-state={state} className={cn(styles.strip, className)} {...props}>
      <span className={styles.dot} aria-hidden />
      <span className={styles.label}>{meeting ? 'Up next' : 'Free'}</span>
      {meeting && color && (
        <span
          className={styles.bar}
          style={{ '--bar-color': resolveColor(color) } as CSSProperties}
        />
      )}
      <span className={styles.title}>{title}</span>
      {countdown && <span className={styles.countdown}>{countdown}</span>}
      {time && <span className={styles.time}>{time}</span>}
      {note}
      {next && (
        <>
          <span className={styles.time} aria-hidden>
            ·
          </span>
          {nextColor && (
            <span
              className={cn(styles.bar, styles.barSm)}
              style={{ '--bar-color': resolveColor(nextColor) } as CSSProperties}
            />
          )}
          <span className={styles.next}>{next}</span>
        </>
      )}
      <span className={styles.spacer} />
      {suggestion && (
        <span className={styles.suggestion}>
          <span className={styles.time}>Good time for</span>
          {suggestionIcon && <span className={styles.glyph}>{renderIcon(suggestionIcon, 14)}</span>}
          <span className={styles.suggestionTitle}>{suggestion}</span>
        </span>
      )}
      {action}
    </div>
  );
});
