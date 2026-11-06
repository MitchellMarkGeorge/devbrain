import { forwardRef, useState, type ComponentPropsWithoutRef, type ReactNode } from 'react';
import { X } from 'lucide-react';
import { cn } from '../../lib/cn';
import { IconButton } from '../../ui/IconButton';
import { Input } from '../../ui/Input';
import { StatusIcon } from '../../entities/StatusIcon';
import { TaskStatus } from '@common/types';
import styles from './DraftTaskRow.module.css';

export interface DraftTaskRowProps extends Omit<ComponentPropsWithoutRef<'div'>, 'title'> {
  title: ReactNode;
  /** not started by default */
  status?: TaskStatus;
  /** takes the task out of the draft; shows the × */
  onRemove?: () => void;
  /** a static hover or focus, for pictures of the row */
  state?: 'hover' | 'focus';
}

/**
 * A task typed into a create dialog before it is saved (a new task's subtasks, a new project's
 * tasks): its status icon, the title, and × to remove it. 32px.
 */
export const DraftTaskRow = forwardRef<HTMLDivElement, DraftTaskRowProps>(function DraftTaskRow(
  { title, status = TaskStatus.NOT_STARTED, onRemove, state, className, ...props },
  ref,
) {
  return (
    <div ref={ref} data-state={state} className={cn(styles.row, className)} {...props}>
      <StatusIcon status={status} size={16} />
      <span className={styles.title}>{title}</span>
      {onRemove && (
        <IconButton
          size="xs"
          tone="muted"
          icon={X}
          label="Remove"
          tooltip={false}
          onClick={onRemove}
        />
      )}
    </div>
  );
});

export interface DraftTaskListProps extends Omit<ComponentPropsWithoutRef<'section'>, 'onSubmit'> {
  /** "Subtasks", "Tasks" */
  label: string;
  /** how many are drafted; shown after the label when there are any */
  count?: number;
  /** the field that adds one: "Add a subtask…" */
  placeholder?: string;
  /** Enter in the field, with its text; the field clears */
  onAdd?: (title: string) => void;
}

/**
 * The drafted tasks of a create dialog: a label and count, the `DraftTaskRow`s, then a field
 * that adds the next one on Enter.
 */
export function DraftTaskList({
  label,
  count,
  placeholder,
  onAdd,
  className,
  children,
  ...props
}: DraftTaskListProps) {
  const [text, setText] = useState('');
  return (
    <section aria-label={label} className={cn(styles.list, className)} {...props}>
      <div className={styles.heading}>
        <span className={styles.label}>{label}</span>
        {count != null && count > 0 && <span className={styles.count}>{count}</span>}
      </div>
      {children}
      <Input
        value={text}
        placeholder={placeholder}
        aria-label={placeholder ?? `Add to ${label}`}
        onChange={(event) => setText(event.currentTarget.value)}
        onKeyDown={(event) => {
          if (event.key === 'Enter' && text.trim()) {
            event.preventDefault();
            onAdd?.(text.trim());
            setText('');
          }
        }}
      />
    </section>
  );
}
