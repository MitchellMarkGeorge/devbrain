import {
  forwardRef,
  type ComponentPropsWithoutRef,
  type KeyboardEvent,
  type MouseEvent,
  type ReactNode,
} from 'react';
import { cn } from '../../lib/cn';
import styles from './HomeRow.module.css';

export interface HomeRowProps extends Omit<ComponentPropsWithoutRef<'div'>, 'title'> {
  /** the 16px glyph: a calendar's `ColourBar`, the file icon, a project's folder */
  icon: ReactNode;
  /** the meeting, note or project, in `foreground-strong` */
  title: ReactNode;
  /** parts before `meta`: Join, what a note belongs to, a project's bar and "3/12" */
  children?: ReactNode;
  /** the time at the right, 12px in a 72px column: "In 12 min", "10:30", "6 min ago", "Due Jul 1" */
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
 * One of Home's minimal rows (meetings, recent notes, recent projects): 36px, 16px in at the
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
      <span className={styles.icon}>{icon}</span>
      <span className={styles.title}>{title}</span>
      {children}
      {meta != null && (
        <span className={styles.meta} data-tone={metaTone}>
          {meta}
        </span>
      )}
    </div>
  );
});

export type HomeRowNoteProps = ComponentPropsWithoutRef<'span'>;

/** Quiet 12px text inside a `HomeRow`: what a note belongs to, a project's "3/12". */
export const HomeRowNote = forwardRef<HTMLSpanElement, HomeRowNoteProps>(function HomeRowNote(
  { className, ...props },
  ref,
) {
  return <span ref={ref} className={cn(styles.note, className)} {...props} />;
});
