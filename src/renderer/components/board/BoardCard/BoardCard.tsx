import { forwardRef, type MouseEvent } from 'react';
import { useRender } from '@base-ui/react/use-render';
import { mergeProps } from '@base-ui/react/merge-props';
import { cva } from 'class-variance-authority';
import { Badge } from '../../ui/Badge';
import { EntityPill, type OpenableEntity } from '../../entities/EntityPill';
import { linkTarget, PillHoverCard, subtasksTarget } from '../../entities/EntityHoverCard';
import { PriorityIcon } from '../../entities/PriorityIcon';
import { ProgressRing } from '../../ui/ProgressRing';
import { SourcePill } from '../../entities/SourcePill';
import { LinkState, TaskStatus, type TaskListItem } from '@common/types';
import { SetDueDateButton } from '../../entities/SetDueDateButton';
import { useFormat } from '../../lib/format';
import { isFromNestedControl } from '../../lib/nested-control';
import { dueTone, isClosed, isDetached, PRIORITY_LABELS, providerOf } from '../../types';
import styles from './BoardCard.module.css';

/** The fields of core's `TaskListItem` a board card reads; pass the row as it is. */
export type BoardCardData = Pick<
  TaskListItem,
  | 'id'
  | 'title'
  | 'status'
  | 'priority'
  | 'dueDate'
  | 'subtaskProgress'
  | 'project'
  | 'link'
  | 'external'
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
  /**
   * shows the task's project pill (the default). A board of one project's tasks (that project's
   * page) passes `false`: the pill would say the same thing on every card.
   */
  showProject?: boolean;
  /**
   * opens what a pill points at, given its summary: the linked event or note, the project. Left
   * out, a click on those pills does nothing (and still doesn't open the task).
   */
  onOpenEntity?: (entity: OpenableEntity) => void;
}

/**
 * A task on the board, drawn from core's `TaskListItem`: the title, then its relations as the pills
 * a task row uses (the key, its subtasks, the linked event or note, the project), then priority (a pill
 * with its gauge and name, "High", as the task page shows it) and the due date ("Jul 1" from `useFormat()`'s `formatListDate`, coloured when due today or overdue,, which moves once a day).
 * A borderless filled card; focusable, so it opens on Enter as well as on click.
 */
export const BoardCard = forwardRef<HTMLDivElement, BoardCardProps>(function BoardCard(
  { task, state, render, onClick, onDueDateChange, onOpenEntity, showProject = true, ...props },
  ref,
) {
  const { now, formatListDate } = useFormat();
  const done = task.status === TaskStatus.COMPLETED;
  const { external, subtaskProgress: subtasks, link, project } = task;
  const pills = [
    external?.key && (
      <PillHoverCard key="source" target={{ type: 'source', title: task.title, external }}>
        <SourcePill provider={providerOf(external)} detached={isDetached(task)}>
          {external.key}
        </SourcePill>
      </PillHoverCard>
    ),
    subtasks && (
      <PillHoverCard key="subtasks" target={subtasksTarget(task.id, subtasks)}>
        <Badge
          muted
          icon={<ProgressRing value={subtasks.completed} total={subtasks.total} size={12} />}
        >
          {subtasks.completed}/{subtasks.total}
        </Badge>
      </PillHoverCard>
    ),
    link && (
      <PillHoverCard key="link" target={linkTarget(link)}>
        <EntityPill entity={link} onClick={onOpenEntity && (() => onOpenEntity(link))} />
      </PillHoverCard>
    ),
    showProject && project && (
      <PillHoverCard key="project" target={{ type: 'project', ...project }}>
        <EntityPill
          entity={{ type: 'project', ...project }}
          onClick={onOpenEntity && (() => onOpenEntity(project))}
        />
      </PillHoverCard>
    ),
  ].filter(Boolean);
  // an undated open task the page can date: "Set due date" at the end of the meta line
  const settable =
    onDueDateChange !== undefined && !isClosed(task.status) && external?.state !== LinkState.SYNCED;

  const children = (
    <>
      <div className={styles.title}>{task.title}</div>
      {pills.length > 0 && <div className={styles.pills}>{pills}</div>}
      <div className={styles.meta}>
        <EntityPill interactive={false} glyph={<PriorityIcon priority={task.priority} size={12} />}>
          {external?.priorityLabel ?? PRIORITY_LABELS[task.priority]}
        </EntityPill>
        {task.dueDate ? (
          <span className={styles.date} data-tone={dueTone(task.status, task.dueDate, now)}>
            {formatListDate(task.dueDate)}
          </span>
        ) : (
          settable &&
          onDueDateChange && (
            <SetDueDateButton className={styles.setDue} onDueDateChange={onDueDateChange} />
          )
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
        onClick: (event: MouseEvent<HTMLDivElement>) => {
          if (!isFromNestedControl(event)) onClick?.(event);
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
