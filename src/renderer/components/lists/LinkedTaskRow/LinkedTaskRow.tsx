import { forwardRef, useState, type ComponentPropsWithoutRef } from 'react';
import { cn } from '../../lib/cn';
import { StatusIcon } from '../../entities/StatusIcon';
import { StatusMenu, type PickableStatus } from '../../entities/StatusMenu';
import type { Task, TaskStatus } from '@common/types';
import { useFormat } from '../../lib/format';
import {
  dueTone,
  isOverdue,
  OVERDUE_LABEL,
  showsOverdueFlag,
  TASK_STATUS_LABELS,
} from '../../types';
import styles from './LinkedTaskRow.module.css';

/** The fields of core's `Task` the row reads. */
export type LinkedTaskRowData = Pick<Task, 'title' | 'status' | 'dueDate'>;

export interface LinkedTaskRowProps extends Omit<ComponentPropsWithoutRef<'div'>, 'title'> {
  /**
   * core's task as it is (a subtask, or a task linked to the note or event). Its status icon is a
   * button that opens the `StatusMenu`, and is controlled while `onStatusChange` is given.
   */
  task: LinkedTaskRowData;
  onStatusChange?: (status: PickableStatus) => void;
  /** opens the task: a click on the row, or Enter */
  onOpen?: () => void;
  /** a static hover or focus, for pictures of the row */
  state?: 'hover' | 'focus';
}

/**
 * The compact 36px task row of a sheet's Subtasks and Linked tasks and a note's Linked tasks
 * panel: the status button (the flag while overdue and not started), the title, then the due date
 * ("Jun 24", "Today", coloured when due today or overdue). No checkbox and no pills.
 */
export const LinkedTaskRow = forwardRef<HTMLDivElement, LinkedTaskRowProps>(function LinkedTaskRow(
  { task, onStatusChange, onOpen, state, className, onKeyDown, ...props },
  ref,
) {
  const { now, formatDue } = useFormat();
  // controlled when the owner listens for changes; otherwise the row keeps its own pick
  const [picked, setPicked] = useState<TaskStatus>(task.status);
  const shown = onStatusChange ? task.status : picked;
  const flag = showsOverdueFlag(shown, isOverdue(shown, task.dueDate, now));
  return (
    // The title is the button that opens the task (a click anywhere on the row does too), beside
    // the status button: a row that was itself a button could not hold one.
    <div
      ref={ref}
      data-state={state}
      data-opens={onOpen ? '' : undefined}
      className={cn(styles.row, className)}
      onClick={(event) => {
        if ((event.target as Element).closest('button') == null) onOpen?.();
      }}
      onKeyDown={onKeyDown}
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
            aria-label={`Status: ${flag ? OVERDUE_LABEL : TASK_STATUS_LABELS[shown]}`}
          >
            <StatusIcon status={shown} overdue={flag} size={16} />
          </button>
        }
      />
      {onOpen ? (
        <button type="button" className={cn(styles.title, styles.open)} onClick={onOpen}>
          {task.title}
        </button>
      ) : (
        <span className={styles.title}>{task.title}</span>
      )}
      {task.dueDate && (
        <span className={styles.date} data-tone={dueTone(shown, task.dueDate, now)}>
          {formatDue(task.dueDate)}
        </span>
      )}
    </div>
  );
});
