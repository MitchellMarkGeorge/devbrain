import { forwardRef, type CSSProperties } from 'react';
import { useRender } from '@base-ui/react/use-render';
import { mergeProps } from '@base-ui/react/merge-props';
import { cva } from 'class-variance-authority';
import { CornerDownRight, FileText, Folder } from 'lucide-react';
import { Icon } from '../Icon';
import { PriorityIcon } from '../PriorityIcon';
import { SourcePill } from '../SourcePill';
import { resolveColor, type Priority, type Provider, type Swatch, type TaskStatus } from '../types';
import styles from './BoardCard.module.css';

/** What a board card shows of a task. */
export interface BoardTask {
  title: string;
  status: TaskStatus;
  priority: Priority;
  /** a synced task's key ("ENG-124"), shown in a compact SourcePill */
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

/**
 * A task on the board: the linked event or note and the source pill, the title, then a line of
 * priority, subtasks, project and date. A borderless filled card; focusable, so it opens on Enter
 * as well as on click.
 */
export const BoardCard = forwardRef<HTMLDivElement, BoardCardProps>(function BoardCard(
  { task, state, render, ...props },
  ref,
) {
  const done = task.status === 'completed';
  const link = task.event ? (
    <div className={styles.link}>
      <span
        className={styles.bar}
        style={{ '--bar-color': resolveColor(task.eventColor) } as CSSProperties}
      />
      <span>{task.event}</span>
    </div>
  ) : task.note ? (
    <div className={styles.link}>
      <Icon icon={FileText} size={12} />
      <span>{task.note}</span>
    </div>
  ) : null;

  const children = (
    <>
      {(link || task.key) && (
        <div className={styles.top}>
          {link}
          {task.key && (
            <SourcePill provider={task.source} compact className={styles.source}>
              {task.key}
            </SourcePill>
          )}
        </div>
      )}
      <div className={styles.title}>{task.title}</div>
      <div className={styles.meta}>
        {!done && <PriorityIcon priority={task.priority} />}
        {task.subtasks && (
          <span className={styles.subtasks}>
            <Icon icon={CornerDownRight} size={12} />
            {task.subtasks[0]}/{task.subtasks[1]}
          </span>
        )}
        {task.project && (
          <span className={styles.project}>
            <Icon
              icon={Folder}
              size={12}
              className={styles.projectIcon}
              data-coloured={task.projectColor ? '' : undefined}
              style={{ '--project-color': resolveColor(task.projectColor) } as CSSProperties}
            />
            <span>{task.project}</span>
          </span>
        )}
        {task.date && (
          <span className={styles.date} data-tone={done ? undefined : task.dateTone}>
            {task.date}
          </span>
        )}
      </div>
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
        ...({
          'data-state': state,
          'data-completed': done ? '' : undefined,
        } as object),
      },
      props,
    ),
  });
});
