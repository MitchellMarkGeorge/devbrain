import type { ComponentPropsWithoutRef } from 'react';
import { cn } from '../../lib/cn';
import { menuStyles } from '../../ui/DropdownMenu';
import styles from './TableSizePicker.module.css';

/** A table's size, as the picker gives it. */
export interface TableSize {
  cols: number;
  rows: number;
}

/** The size the slash menu's Table inserts unless another is picked. */
export const DEFAULT_TABLE_SIZE: TableSize = { cols: 3, rows: 3 };

/** The largest size the grid offers; a table grows past it afterwards. */
export const TABLE_SIZE_LIMIT: TableSize = { cols: 8, rows: 6 };

export interface TableSizePickerProps extends Omit<
  ComponentPropsWithoutRef<'div'>,
  'onSelect' | 'children'
> {
  /** the size highlighted */
  value: TableSize;
  /** pointing at a square highlights the size it ends */
  onValueChange?: (size: TableSize) => void;
  /** clicking a square picks its size */
  onSelect?: (size: TableSize) => void;
  /** the editor's keys move the highlight (← → ↑ ↓) and ↵ picks it: shown with a ring */
  keyboard?: boolean;
}

/**
 * A grid of 18px squares, 8 columns by 6 rows, beside the slash menu's Table item: the squares up
 * to the size highlighted are tinted, the first row stronger as the header row, and the size is
 * named under it ("4 columns · 3 rows"). The caret stays in the editor, which passes the arrow
 * keys and ↵ on while `keyboard` is set.
 */
export function TableSizePicker({
  value,
  onValueChange,
  onSelect,
  keyboard = false,
  className,
  ...props
}: TableSizePickerProps) {
  const squares = [];
  for (let row = 1; row <= TABLE_SIZE_LIMIT.rows; row += 1) {
    for (let col = 1; col <= TABLE_SIZE_LIMIT.cols; col += 1) {
      const size = { cols: col, rows: row };
      squares.push(
        <span
          key={`${row}-${col}`}
          className={styles.square}
          data-on={col <= value.cols && row <= value.rows ? '' : undefined}
          data-header={row === 1 ? '' : undefined}
          onPointerEnter={() => onValueChange?.(size)}
          // keeps the caret in the editor
          onMouseDown={(event) => event.preventDefault()}
          onClick={() => onSelect?.(size)}
        />,
      );
    }
  }
  return (
    <div className={cn(menuStyles.popup, styles.picker, className)} {...props}>
      <div
        className={styles.grid}
        role="img"
        aria-label={`${value.cols} columns, ${value.rows} rows`}
        data-keyboard={keyboard ? '' : undefined}
      >
        {squares}
      </div>
      <div className={styles.size}>
        {value.cols} {value.cols === 1 ? 'column' : 'columns'} · {value.rows}{' '}
        {value.rows === 1 ? 'row' : 'rows'}
      </div>
      <div className={styles.hint}>
        {keyboard ? '↵ inserts it' : '→ picks a size with the keys'}
      </div>
    </div>
  );
}
