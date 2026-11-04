import { forwardRef, type ComponentProps, type ReactNode } from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { Calendar, ChevronsUp, Circle, Ellipsis, Folder, X } from 'lucide-react';
import { cn } from '../../lib/cn';
import { Button } from '../Button';
import { IconButton } from '../IconButton';
import { DropdownMenu, DropdownMenuContent } from '../DropdownMenu';
import { DropdownMenuTrigger } from '../DropdownMenu';
import styles from './SelectionBar.module.css';

export const selectionBarVariants = cva(styles.bar, {
  variants: {
    /** sticks to the bottom of its scrolling list; `false` sits where it is placed */
    floating: { true: styles.floating, false: undefined },
  },
  defaultVariants: { floating: true },
});

export interface SelectionBarProps
  extends Omit<ComponentProps<'div'>, 'children'>, VariantProps<typeof selectionBarVariants> {
  /** how many rows are selected */
  count: number;
  /** clears the selection (the × button) */
  onClear?: () => void;
  onStatus?: () => void;
  onPriority?: () => void;
  onDueDate?: () => void;
  onMove?: () => void;
  /** the "more" menu's items (`DropdownMenuItem`s); without them the button calls `onMore` */
  more?: ReactNode;
  onMore?: () => void;
  /** replaces the standard actions (Status, Priority, Due date, Move) */
  actions?: ReactNode;
}

/**
 * The bar that floats over the bottom of a list while rows are selected: the count, then ghost
 * actions for Status, Priority, Due date and Move, a "more" menu and clear. `TaskList` shows it
 * on its own.
 */
export const SelectionBar = forwardRef<HTMLDivElement, SelectionBarProps>(function SelectionBar(
  {
    count,
    onClear,
    onStatus,
    onPriority,
    onDueDate,
    onMove,
    more,
    onMore,
    actions,
    floating,
    className,
    ...props
  },
  ref,
) {
  const moreButton = (
    <IconButton
      size="sm"
      icon={Ellipsis}
      label="More actions"
      className={styles.iconAction}
      onClick={more ? undefined : onMore}
    />
  );
  return (
    <div
      ref={ref}
      role="toolbar"
      aria-label="Selected tasks"
      className={cn(selectionBarVariants({ floating }), className)}
      {...props}
    >
      <span className={styles.count} aria-live="polite">
        {count} selected
      </span>
      <span className={styles.separator} aria-hidden />
      {actions ?? (
        <>
          <Button
            variant="ghost"
            size="sm"
            icon={Circle}
            className={styles.action}
            onClick={onStatus}
          >
            Status
          </Button>
          <Button
            variant="ghost"
            size="sm"
            icon={ChevronsUp}
            className={styles.action}
            onClick={onPriority}
          >
            Priority
          </Button>
          <Button
            variant="ghost"
            size="sm"
            icon={Calendar}
            className={styles.action}
            onClick={onDueDate}
          >
            Due date
          </Button>
          <Button
            variant="ghost"
            size="sm"
            icon={Folder}
            className={styles.action}
            onClick={onMove}
          >
            Move
          </Button>
        </>
      )}
      {more ? (
        <DropdownMenu>
          <DropdownMenuTrigger render={moreButton} />
          <DropdownMenuContent side="top" align="end" sideOffset={8}>
            {more}
          </DropdownMenuContent>
        </DropdownMenu>
      ) : (
        moreButton
      )}
      <IconButton
        size="sm"
        icon={X}
        label="Clear selection"
        className={styles.iconAction}
        onClick={onClear}
      />
    </div>
  );
});
