import { forwardRef, type ComponentPropsWithoutRef } from 'react';
import { GripHorizontal, GripVertical, Plus } from 'lucide-react';
import { cn } from '../../lib/cn';
import { Icon } from '../../ui/Icon';
import { Tooltip } from '../../ui/Tooltip';
import styles from './TableHandle.module.css';

/** Which way a handle or button works: on a column (above the table) or a row (left of it). */
export type TableAxis = 'column' | 'row';

export interface TableHandleProps extends ComponentPropsWithoutRef<'button'> {
  axis: TableAxis;
  /** its menu is open, or its column or row is being dragged: tinted in the selection's blue */
  active?: boolean;
}

/**
 * The grip on the edge of the column or row under the pointer: 24×14 above a column, 14×24 left
 * of a row, a `popover` pill with the `edge` outline. Clicking it opens the `TableMenu`; dragging
 * it moves the column or row. The editor places it and wires both; this draws it.
 */
export const TableHandle = forwardRef<HTMLButtonElement, TableHandleProps>(function TableHandle(
  { axis, active, className, ...props },
  ref,
) {
  return (
    <button
      ref={ref}
      type="button"
      aria-label={axis === 'column' ? 'Column options' : 'Row options'}
      aria-haspopup="menu"
      data-axis={axis}
      data-active={active ? '' : undefined}
      className={cn(styles.handle, className)}
      {...props}
    >
      <Icon icon={axis === 'column' ? GripHorizontal : GripVertical} size={12} />
    </button>
  );
});

export interface TableInsertButtonProps extends ComponentPropsWithoutRef<'button'> {
  axis: TableAxis;
}

/**
 * The 16px round "+" on the line between two columns (above the table) or two rows (left of it),
 * shown while the pointer is near that line: it inserts a column or row there.
 */
export const TableInsertButton = forwardRef<HTMLButtonElement, TableInsertButtonProps>(
  function TableInsertButton({ axis, className, ...props }, ref) {
    const label = axis === 'column' ? 'Insert column' : 'Insert row';
    return (
      <Tooltip content={label} side={axis === 'column' ? 'top' : 'left'}>
        <button
          ref={ref}
          type="button"
          aria-label={label}
          data-axis={axis}
          className={cn(styles.insert, className)}
          {...props}
        >
          <Icon icon={Plus} size={12} />
        </button>
      </Tooltip>
    );
  },
);

export interface TableAddButtonProps extends ComponentPropsWithoutRef<'button'> {
  /** `row`: the bar under the table; `column`: the bar beside it */
  axis: TableAxis;
}

/**
 * The bar under the table (10px, adds a row) or beside it (14px, adds a column), as long as the table:
 * a `muted` fill with a "+", stronger while pointed at. The editor shows it while the pointer is
 * over the table.
 */
export const TableAddButton = forwardRef<HTMLButtonElement, TableAddButtonProps>(
  function TableAddButton({ axis, className, ...props }, ref) {
    const label = axis === 'column' ? 'Add column' : 'Add row';
    return (
      <Tooltip content={label} side={axis === 'column' ? 'right' : 'bottom'}>
        <button
          ref={ref}
          type="button"
          aria-label={label}
          data-axis={axis}
          className={cn(styles.add, className)}
          {...props}
        >
          <Icon icon={Plus} size={axis === 'row' ? 10 : 12} />
        </button>
      </Tooltip>
    );
  },
);
