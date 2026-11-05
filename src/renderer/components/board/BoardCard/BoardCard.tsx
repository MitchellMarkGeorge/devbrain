import { forwardRef, type MouseEvent } from 'react';
import { useRender } from '@base-ui/react/use-render';
import { mergeProps } from '@base-ui/react/merge-props';
import { cva } from 'class-variance-authority';
import { Badge } from '../../ui/Badge';
import { EntityPill } from '../../entities/EntityPill';
import { PriorityIcon } from '../../entities/PriorityIcon';
import { ProgressRing } from '../../ui/ProgressRing';
import { SourcePill } from '../../entities/SourcePill';
import type { Priority, Provider, Swatch, TaskStatus } from '../../types';
import styles from './BoardCard.module.css';

/** What a board card shows of a task. */
export interface BoardTask {
  title: string;
  status: TaskStatus;
  priority: Priority;
  /** a synced task's key ("ENG-124"), shown in a SourcePill */
  key?: string;
  /** where a synced task comes from (linear by default) */
  source?: Provider;
  project?: string;
  /** the project's folder colour: a swatch name or a CSS colour */
  projectColor?: Swatch | string;
  /** the linked event, shown with its calendar's bar on the top line */
  event?: string;
  eventColor?: Swatch | string;
  /** the linked note, when there is no event */
  note?: string;
  /** subtasks done and total */
  subtasks?: [done: number, total: number];
  /** a short date: "Today", "Sep 28" */
  date?: string;
  dateTone?: 'today' | 'overdue';
}

export const boardCardVariants = cva(styles.card, {
  variants: { completed: { true: styles.completed } },
});

export interface BoardCardProps extends useRender.ComponentProps<'div'> {
  task: BoardTask;
  /** draw a state without the pointer or keyboard, for static pictures */
  state?: 'hover' | 'focus';
}

// clicks on the card's pills open what they link to, not the task
function fromControl(event: MouseEvent<HTMLElement>): boolean {
  const control = (event.target as Element).closest('button, a, input');
  return control != null && control !== event.currentTarget;
}

/**
 * A task on the board: the title, then its relations as the pills a task row uses (the source
 * key, the parent's subtasks, the linked event or note, the project), then priority and the date.
 * A borderless filled card; focusable, so it opens on Enter as well as on click.
 */
export const BoardCard = forwardRef<HTMLDivElement, BoardCardProps>(function BoardCard(
  { task, state, render, onClick, ...props },
  ref,
) {
  const done = task.status === 'completed';
  const pills = [
    task.key && (
      <SourcePill key="source" provider={task.source}>
        {task.key}
      </SourcePill>
    ),
    task.subtasks && (
      <Badge
        key="subtasks"
        muted
        icon={<ProgressRing value={task.subtasks[0]} total={task.subtasks[1]} size={12} />}
      >
        {task.subtasks[0]}/{task.subtasks[1]}
      </Badge>
    ),
    task.event ? (
      <EntityPill key="event" type="event" color={task.eventColor}>
        {task.event}
      </EntityPill>
    ) : (
      task.note && (
        <EntityPill key="note" type="note">
          {task.note}
        </EntityPill>
      )
    ),
    task.project && (
      <EntityPill key="project" type="project" color={task.projectColor}>
        {task.project}
      </EntityPill>
    ),
  ].filter(Boolean);
  const meta = !done || task.date;

  const children = (
    <>
      <div className={styles.title}>{task.title}</div>
      {pills.length > 0 && <div className={styles.pills}>{pills}</div>}
      {meta && (
        <div className={styles.meta}>
          {!done && <PriorityIcon priority={task.priority} />}
          {task.date && (
            <span className={styles.date} data-tone={done ? undefined : task.dateTone}>
              {task.date}
            </span>
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
