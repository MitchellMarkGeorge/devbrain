import { forwardRef, type ComponentPropsWithoutRef } from 'react';
import { Plus } from 'lucide-react';
import { cn } from '../../lib/cn';
import { IconButton } from '../../ui/IconButton';
import { Icon } from '../../ui/Icon';
import { StatusIcon } from '../../entities/StatusIcon';
import type { TaskStatus } from '../../types';
import styles from './BoardColumn.module.css';

export type BoardProps = ComponentPropsWithoutRef<'div'>;

/** The board: its columns side by side in equal widths, 24px apart. */
export const Board = forwardRef<HTMLDivElement, BoardProps>(function Board(
  { className, ...props },
  ref,
) {
  return <div ref={ref} className={cn(styles.board, className)} {...props} />;
});

export interface BoardColumnProps extends Omit<ComponentPropsWithoutRef<'section'>, 'children'> {
  /** the status name: "In progress" */
  name: string;
  status: TaskStatus;
  /** a count after the name; the designed board leaves it out (the cards show how many) */
  count?: number;
  /** end the column with the dashed "Add task" slot; false for Completed */
  add?: boolean;
  /** the header's "+" and the "Add task" slot */
  onAdd?: () => void;
  /** the column's `BoardCard`s */
  children?: React.ReactNode;
}

/**
 * An open status column: no panel, a 24px header (status icon, name, a ghost "+" on the right)
 * over its cards, 10px apart, and a dashed "Add task" slot.
 */
export const BoardColumn = forwardRef<HTMLElement, BoardColumnProps>(function BoardColumn(
  { name, status, count, add = true, onAdd, className, children, ...props },
  ref,
) {
  return (
    <section ref={ref} aria-label={name} className={cn(styles.column, className)} {...props}>
      <div className={styles.header}>
        <StatusIcon status={status} />
        {name}
        {count != null && <span className={styles.count}>{count}</span>}
        <IconButton
          size="xs"
          icon={Plus}
          label={`Add task to ${name}`}
          className={styles.add}
          onClick={onAdd}
        />
      </div>
      <div className={styles.cards}>
        {children}
        {add && (
          <button type="button" className={styles.slot} onClick={onAdd}>
            <Icon icon={Plus} size={16} />
            Add task
          </button>
        )}
      </div>
    </section>
  );
});
