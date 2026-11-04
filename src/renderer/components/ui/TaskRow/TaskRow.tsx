import {
  Children,
  forwardRef,
  useState,
  type ComponentProps,
  type KeyboardEvent,
  type MouseEvent,
  type ReactNode,
} from 'react';
import { cva } from 'class-variance-authority';
import { cn } from '../../lib/cn';
import { Badge } from '../Badge';
import { Checkbox } from '../Checkbox';
import { EntityPill } from '../EntityPill';
import { PriorityIcon } from '../PriorityIcon';
import { ProgressRing } from '../ProgressRing';
import { SourcePill } from '../SourcePill';
import { StatusIcon } from '../StatusIcon';
import { StatusMenu, type PickableStatus } from '../StatusMenu';
import { TASK_STATUS_LABELS, type TaskStatus } from '../types';
import type { Task } from './types';
import styles from './TaskRow.module.css';

export const taskRowVariants = cva(styles.row, {
  variants: {
    /** indented under its parent */
    subtask: { true: styles.subtask },
  },
});

export interface TaskRowProps extends Omit<ComponentProps<'div'>, 'onSelect' | 'children'> {
  task: Task;
  /** the row is selected (falls back to `task.selected`) */
  selected?: boolean;
  /** something in the list is selected: every row shows its checkbox */
  selecting?: boolean;
  /** joins a selected row to the selected row above or below into one block */
  joinPrev?: boolean;
  joinNext?: boolean;
  /** a static hover or focus, for pictures of the row */
  state?: 'hover' | 'focus';
  subtask?: boolean;
  /**
   * stacks the pills when the row runs out of room: after the title (`right`), or also the key
   * with the subtask or parent pill (`both`). A side with one pill never stacks.
   */
  stack?: 'right' | 'both';
  /** the status, when controlled; otherwise the row keeps `task.status` and its own changes */
  status?: TaskStatus;
  onStatusChange?: (status: PickableStatus) => void;
  /** the status menu is open (controlled), or open at first (`defaultMenuOpen`) */
  menuOpen?: boolean;
  defaultMenuOpen?: boolean;
  onMenuOpenChange?: (open: boolean) => void;
  /** toggles the row's selection (the checkbox, or `X` on the focused row) */
  onSelect?: () => void;
  /** opens the task (a click on the row, or Enter) */
  onOpen?: () => void;
}

/** The status the icon shows: overdue (the flag) until the task is started or done. */
export function shownStatus(status: TaskStatus, dateTone: Task['dateTone']): TaskStatus {
  if (status === 'completed' || status === 'cancelled') return status;
  if (dateTone === 'overdue' && status !== 'in-progress') return 'overdue';
  return status;
}

/** The pills on one side of the title, stacked like a deck when the row runs out of room. */
function PillStack({ stacked, children }: { stacked: boolean; children: ReactNode }) {
  const pills = Children.toArray(children);
  if (pills.length === 0) return null;
  return (
    <span className={styles.stack} data-stacked={stacked && pills.length > 1 ? '' : undefined}>
      {pills}
    </span>
  );
}

// clicks on the row's own controls (checkbox, status, pills) don't open the task
function fromControl(event: MouseEvent<HTMLElement>): boolean {
  const control = (event.target as Element).closest('button, a, [role="checkbox"], input');
  return control != null && control !== event.currentTarget;
}

/**
 * One task in a strokeless list: the status button (opening the `StatusMenu`), the title, its
 * source, parent and subtask pills, then entity pills, priority and the date on the right. Use it
 * inside `TaskList`, which handles selection and keyboard movement.
 *
 * Keyboard on the focused row: `S` opens the status menu (then `1`, `2`, `3`), `X` toggles
 * selection, Enter opens the task.
 */
export const TaskRow = forwardRef<HTMLDivElement, TaskRowProps>(function TaskRow(
  {
    task,
    selected: selectedProp,
    selecting,
    joinPrev,
    joinNext,
    state,
    subtask,
    stack,
    status: statusProp,
    onStatusChange,
    menuOpen: menuOpenProp,
    defaultMenuOpen = false,
    onMenuOpenChange,
    onSelect,
    onOpen,
    className,
    onKeyDown,
    onClick,
    ...props
  },
  ref,
) {
  const [statusState, setStatusState] = useState(task.status);
  const status = statusProp ?? statusState;
  const [menuOpenState, setMenuOpenState] = useState(defaultMenuOpen);
  const menuOpen = menuOpenProp ?? menuOpenState;
  const selected = selectedProp ?? !!task.selected;
  const completed = status === 'completed';
  const shown = shownStatus(status, task.dateTone);

  function setMenuOpen(open: boolean) {
    setMenuOpenState(open);
    onMenuOpenChange?.(open);
  }

  function handleKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    onKeyDown?.(event);
    if (event.defaultPrevented || event.target !== event.currentTarget) return;
    const key = event.key.toLowerCase();
    if (key === 's') {
      event.preventDefault();
      setMenuOpen(true);
    } else if (key === 'x' && onSelect) {
      event.preventDefault();
      onSelect();
    } else if (event.key === 'Enter' && onOpen) {
      event.preventDefault();
      onOpen();
    }
  }

  function handleClick(event: MouseEvent<HTMLDivElement>) {
    onClick?.(event);
    if (!event.defaultPrevented && onOpen && !fromControl(event)) onOpen();
  }

  return (
    <div
      ref={ref}
      role="row"
      tabIndex={0}
      aria-selected={selected}
      data-selected={selected ? '' : undefined}
      data-selecting={selecting ? '' : undefined}
      data-join-prev={joinPrev ? '' : undefined}
      data-join-next={joinNext ? '' : undefined}
      data-state={state}
      data-completed={completed ? '' : undefined}
      data-menu-open={menuOpen ? '' : undefined}
      className={cn(taskRowVariants({ subtask }), className)}
      onKeyDown={handleKeyDown}
      onClick={handleClick}
      {...props}
    >
      <Checkbox
        className={styles.check}
        checked={selected}
        onCheckedChange={() => onSelect?.()}
        tabIndex={-1}
        aria-label={`Select ${task.title}`}
      />
      <StatusMenu
        status={status}
        open={menuOpen}
        onOpenChange={setMenuOpen}
        onStatusChange={(picked) => {
          setStatusState(picked);
          onStatusChange?.(picked);
        }}
        trigger={
          <button
            type="button"
            className={styles.status}
            tabIndex={-1}
            aria-label={`Status: ${TASK_STATUS_LABELS[shown]}`}
          >
            <StatusIcon status={shown} />
          </button>
        }
      />
      <div className={styles.title}>
        <span className={styles.name}>{task.title}</span>
        <PillStack stacked={stack === 'both'}>
          {task.key && <SourcePill provider={task.source}>{task.key}</SourcePill>}
          {task.parent && (
            <EntityPill type="parent" status={task.parentStatus}>
              {task.parent}
            </EntityPill>
          )}
          {task.subtasks && (
            <Badge
              muted
              icon={<ProgressRing value={task.subtasks[0]} total={task.subtasks[1]} size={12} />}
            >
              {task.subtasks[0]}/{task.subtasks[1]}
            </Badge>
          )}
        </PillStack>
      </div>
      <div className={styles.side}>
        <PillStack stacked={stack != null}>
          {task.project && (
            <EntityPill type="project" color={task.projectColor}>
              {task.project}
            </EntityPill>
          )}
          {task.event && (
            <EntityPill type="event" color={task.eventColor}>
              {task.event}
            </EntityPill>
          )}
          {task.note && <EntityPill type="note">{task.note}</EntityPill>}
        </PillStack>
        <span className={styles.priority}>
          {!completed && <PriorityIcon priority={task.priority} />}
        </span>
        <span
          className={cn(
            styles.date,
            !completed && task.dateTone === 'today' && styles.today,
            !completed && task.dateTone === 'overdue' && styles.overdue,
          )}
        >
          {task.date}
        </span>
      </div>
    </div>
  );
});
