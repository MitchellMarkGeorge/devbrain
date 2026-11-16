import { forwardRef, type MouseEvent } from 'react';
import { useRender } from '@base-ui/react/use-render';
import { mergeProps } from '@base-ui/react/merge-props';
import { cva } from 'class-variance-authority';
import { Badge } from '../../ui/Badge';
import { EntityPill } from '../../entities/EntityPill';
import { PriorityIcon } from '../../entities/PriorityIcon';
import { ProgressRing } from '../../ui/ProgressRing';
import { SourcePill } from '../../entities/SourcePill';
import { LinkState, TaskStatus, type TaskListItem } from '@common/types';
import { SetDueDateButton } from '../../entities/SetDueDateButton';
import { useFormat } from '../../lib/format';
import { dueTone, isClosed, providerOf } from '../../types';
import styles from './BoardCard.module.css';

/** The fields of core's `TaskListItem` a board card reads; pass the row as it is. */
export type BoardCardData = Pick<
  TaskListItem,
  'title' | 'status' | 'priority' | 'dueDate' | 'subtaskProgress' | 'project' | 'link' | 'external'
>;

export const boardCardVariants = cva(styles.card, {
  variants: { completed: { true: styles.completed } },
});

export interface BoardCardProps extends useRender.ComponentProps<'div'> {
  /** core's task as it is: a `TaskListItem` */
  task: BoardCardData;
  /** draw a state without the pointer or keyboard, for static pictures */
  state?: 'hover' | 'focus';
  /**
   * sets a due date on a task without one: the meta line shows "Set due date" at its end while
   * the card is pointed at or focused. Left out (or for a closed or synced task), nothing shows.
   */
  onDueDateChange?: (date: Date) => void;
}

// clicks on the card's pills open what they link to, not the task
function fromControl(event: MouseEvent<HTMLElement>): boolean {
  // a click in something the card opened (its status menu, a date picker, its context menu):
  // portalled elsewhere in the page, but React still bubbles it up to the card
  if (!event.currentTarget.contains(event.target as Node)) return true;
  const control = (event.target as Element).closest('button, a, [role="checkbox"], input');
  return control != null && control !== event.currentTarget;
}

/**
 * A task on the board, drawn from core's `TaskListItem`: the title, then its relations as the pills
 * a task row uses (the key, its subtasks, the linked event or note, the project), then priority and
 * the due date (worded and coloured from `useFormat()`, which moves once a day).
 * A borderless filled card; focusable, so it opens on Enter as well as on click.
 */
export const BoardCard = forwardRef<HTMLDivElement, BoardCardProps>(function BoardCard(
  { task, state, render, onClick, onDueDateChange, ...props },
  ref,
) {
  const { now, formatDue } = useFormat();
  const done = task.status === TaskStatus.COMPLETED;
  const { external, subtaskProgress: subtasks } = task;
  const pills = [
    external?.key && (
      <SourcePill key="source" provider={providerOf(external)}>
        {external.key}
      </SourcePill>
    ),
    subtasks && (
      <Badge
        key="subtasks"
        muted
        icon={<ProgressRing value={subtasks.completed} total={subtasks.total} size={12} />}
      >
        {subtasks.completed}/{subtasks.total}
      </Badge>
    ),
    task.link && <EntityPill key="link" entity={task.link} />,
    task.project && <EntityPill key="project" entity={{ type: 'project', ...task.project }} />,
  ].filter(Boolean);
  // an undated open task the page can date: "Set due date" at the end of the meta line
  const settable =
    onDueDateChange !== undefined && !isClosed(task.status) && external?.state !== LinkState.SYNCED;
  const meta = !done || task.dueDate;

  const children = (
    <>
      <div className={styles.title}>{task.title}</div>
      {pills.length > 0 && <div className={styles.pills}>{pills}</div>}
      {meta && (
        <div className={styles.meta}>
          {!done && <PriorityIcon priority={task.priority} />}
          {task.dueDate ? (
            <span className={styles.date} data-tone={dueTone(task.status, task.dueDate, now)}>
              {formatDue(task.dueDate)}
            </span>
          ) : (
            settable &&
            onDueDateChange && (
              <SetDueDateButton className={styles.setDue} onDueDateChange={onDueDateChange} />
            )
          )}
        </div>
      )}
    </>
  );

  return useRender({
    ref,
    defaultTagName: 'div',
    render,
    props: mergeProps<'div'>(
      {
        className: boardCardVariants({ completed: done }),
        tabIndex: 0,
        children,
        onClick: (event: MouseEvent<HTMLDivElement>) => {
          if (!fromControl(event)) onClick?.(event);
        },
        ...({
          'data-state': state,
          'data-completed': done ? '' : undefined,
        } as object),
      },
      props,
    ),
  });
});
