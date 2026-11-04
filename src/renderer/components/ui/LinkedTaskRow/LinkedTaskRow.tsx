import { forwardRef, useState, type ComponentPropsWithoutRef, type ReactNode } from 'react';
import { cn } from '../../lib/cn';
import { StatusIcon } from '../StatusIcon';
import { StatusMenu, type PickableStatus } from '../StatusMenu';
import { TASK_STATUS_LABELS, type TaskStatus } from '../types';
import styles from './LinkedTaskRow.module.css';

export interface LinkedTaskRowProps extends Omit<ComponentPropsWithoutRef<'div'>, 'title'> {
  title: ReactNode;
  /**
   * the task's status; its icon is a button that opens the `StatusMenu`. Controlled while
   * `onStatusChange` is given.
   */
  status: TaskStatus;
  onStatusChange?: (status: PickableStatus) => void;
  /** the due date as shown: "Jun 24", "Today" */
  date?: ReactNode;
  /** `today` and `overdue` colour the date */
  dateTone?: 'today' | 'overdue';
  /** opens the task: a click on the row, or Enter */
  onOpen?: () => void;
  /** a static hover or focus, for pictures of the row */
  state?: 'hover' | 'focus';
}

/**
 * The compact 36px task row of a sheet's Subtasks and Linked tasks and a note's Linked tasks
 * panel: the status button, the title, then the date. No checkbox and no pills.
 */
export const LinkedTaskRow = forwardRef<HTMLDivElement, LinkedTaskRowProps>(function LinkedTaskRow(
  { title, status, onStatusChange, date, dateTone, onOpen, state, className, onKeyDown, ...props },
  ref,
) {
  // controlled when the owner listens for changes; otherwise the row keeps its own pick
  const [picked, setPicked] = useState<TaskStatus>(status);
  const shown = onStatusChange ? status : picked;
  return (
    <div
      ref={ref}
      role={onOpen ? 'button' : undefined}
      tabIndex={onOpen ? 0 : undefined}
      data-state={state}
      className={cn(styles.row, className)}
      onClick={(event) => {
        if ((event.target as Element).closest('button') == null) onOpen?.();
      }}
      onKeyDown={(event) => {
        onKeyDown?.(event);
        if (event.key === 'Enter' && event.target === event.currentTarget && onOpen) {
          event.preventDefault();
          onOpen();
        }
      }}
      {...props}
    >
      <StatusMenu
        status={shown}
        onStatusChange={(next) => {
          setPicked(next);
          onStatusChange?.(next);
        }}
        trigger={
          <button
            type="button"
            className={styles.status}
            aria-label={`Status: ${TASK_STATUS_LABELS[shown]}`}
          >
            <StatusIcon status={shown} size={16} />
          </button>
        }
      />
      <span className={styles.title}>{title}</span>
      {date != null && (
        <span className={styles.date} data-tone={dateTone}>
          {date}
        </span>
      )}
    </div>
  );
});
