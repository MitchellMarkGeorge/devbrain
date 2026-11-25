import { Menu } from '@base-ui/react/menu';
import {
  AlignCenter,
  AlignLeft,
  AlignRight,
  ArrowDown,
  ArrowDown10,
  ArrowDownZA,
  ArrowLeft,
  ArrowRight,
  ArrowUp,
  ArrowUp01,
  ArrowUpAZ,
  BetweenHorizontalEnd,
  BetweenHorizontalStart,
  BetweenVerticalEnd,
  BetweenVerticalStart,
  CopyPlus,
  Eraser,
  PanelTop,
  Trash2,
} from 'lucide-react';
import { mergeClassName } from '../../lib/cn';
import {
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  type DropdownMenuContentProps,
} from '../../ui/DropdownMenu';
import { Icon } from '../../ui/Icon';
import type { TableAxis } from '../TableHandle';
import styles from './TableMenu.module.css';

/** A column's alignment; `left` is also a column with none set. */
export type TableAlignment = 'left' | 'center' | 'right';

export const TABLE_ALIGNMENTS = [
  { value: 'left', label: 'Align left', icon: AlignLeft },
  { value: 'center', label: 'Align center', icon: AlignCenter },
  { value: 'right', label: 'Align right', icon: AlignRight },
] as const;

export interface TableMenuProps extends Omit<DropdownMenuContentProps, 'children'> {
  axis: TableAxis;
  /** what it acts on, at the top: "Column · Endpoint", "Row 2", "Header row" */
  label: string;
  /** a row menu for the header row: Turn into a normal row, Insert below, Clear, Delete */
  headerRow?: boolean;
  /** a column menu's alignment, as three buttons at the top */
  alignment?: TableAlignment;
  onAlignmentChange?: (alignment: TableAlignment) => void;
  /** the column holds numbers: its sorts read "0 → 9" rather than "A → Z" */
  numeric?: boolean;
  onSort?: (direction: 'ascending' | 'descending') => void;
  /** insert above (a row) or left (a column) */
  onInsertBefore?: () => void;
  /** insert below or right */
  onInsertAfter?: () => void;
  /** move up or left; left out where it can't, so the item shows disabled */
  onMoveBefore?: () => void;
  /** move down or right */
  onMoveAfter?: () => void;
  onDuplicate?: () => void;
  onClear?: () => void;
  onDelete?: () => void;
  /** the header row's Turn into a normal row */
  onToggleHeader?: () => void;
  /**
   * The pointer or keyboard is on Clear or Delete (true) or has left it (false), for the editor
   * to tint the cells that would change.
   */
  onPreviewChange?: (preview: 'clear' | 'delete' | null) => void;
}

/**
 * The menu of a table's column or row, opened from its `TableHandle`: for a column, its alignment
 * as three buttons, then Sort, Insert left and right, Move left and right, Duplicate, Clear
 * contents and Delete column; for a row, Insert above and below, Move up and down, Duplicate,
 * Clear contents and Delete row. The header row has Turn into a normal row in place of moving.
 * The shortcuts beside the items work in a cell.
 *
 * It offers only what a Markdown table keeps: an alignment is the whole column's, and there are
 * no merges, colours or widths. Put it in a `DropdownMenu`, anchored to the handle.
 */
export function TableMenu({
  axis,
  label,
  headerRow = false,
  alignment = 'left',
  onAlignmentChange,
  numeric = false,
  onSort,
  onInsertBefore,
  onInsertAfter,
  onMoveBefore,
  onMoveAfter,
  onDuplicate,
  onClear,
  onDelete,
  onToggleHeader,
  onPreviewChange,
  width = 'default',
  className,
  ...props
}: TableMenuProps) {
  const column = axis === 'column';
  // the cells a Clear or Delete would change are tinted while it is pointed at or highlighted
  const preview = (kind: 'clear' | 'delete') => ({
    onPointerEnter: () => onPreviewChange?.(kind),
    onPointerLeave: () => onPreviewChange?.(null),
    onFocus: () => onPreviewChange?.(kind),
    onBlur: () => onPreviewChange?.(null),
  });
  return (
    <DropdownMenuContent
      width={width}
      className={mergeClassName(styles.menu, className)}
      {...props}
    >
      <DropdownMenuGroup>
        <DropdownMenuLabel className={styles.label}>{label}</DropdownMenuLabel>
        {column && (
          <Menu.RadioGroup
            value={alignment}
            onValueChange={(value: TableAlignment) => onAlignmentChange?.(value)}
            className={styles.alignments}
            aria-label="Alignment"
          >
            {TABLE_ALIGNMENTS.map((option) => (
              <Menu.RadioItem
                key={option.value}
                value={option.value}
                aria-label={option.label}
                title={option.label}
                className={styles.alignment}
              >
                <Icon icon={option.icon} size={16} />
              </Menu.RadioItem>
            ))}
          </Menu.RadioGroup>
        )}
      </DropdownMenuGroup>
      {column && onSort && (
        <>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            icon={numeric ? ArrowUp01 : ArrowUpAZ}
            onClick={() => onSort('ascending')}
          >
            {numeric ? 'Sort 0 → 9' : 'Sort A → Z'}
          </DropdownMenuItem>
          <DropdownMenuItem
            icon={numeric ? ArrowDown10 : ArrowDownZA}
            onClick={() => onSort('descending')}
          >
            {numeric ? 'Sort 9 → 0' : 'Sort Z → A'}
          </DropdownMenuItem>
        </>
      )}
      <DropdownMenuSeparator />
      {headerRow ? (
        <>
          <DropdownMenuItem icon={PanelTop} onClick={onToggleHeader}>
            Turn into a normal row
          </DropdownMenuItem>
          <DropdownMenuItem icon={BetweenHorizontalEnd} shortcut="⌘↵" onClick={onInsertAfter}>
            Insert below
          </DropdownMenuItem>
        </>
      ) : column ? (
        <>
          <DropdownMenuItem icon={BetweenVerticalStart} shortcut="⌘⌥←" onClick={onInsertBefore}>
            Insert left
          </DropdownMenuItem>
          <DropdownMenuItem icon={BetweenVerticalEnd} shortcut="⌘⌥→" onClick={onInsertAfter}>
            Insert right
          </DropdownMenuItem>
          <DropdownMenuItem
            icon={ArrowLeft}
            shortcut="⌥⇧←"
            disabled={!onMoveBefore}
            onClick={onMoveBefore}
          >
            Move left
          </DropdownMenuItem>
          <DropdownMenuItem
            icon={ArrowRight}
            shortcut="⌥⇧→"
            disabled={!onMoveAfter}
            onClick={onMoveAfter}
          >
            Move right
          </DropdownMenuItem>
          <DropdownMenuItem icon={CopyPlus} onClick={onDuplicate}>
            Duplicate
          </DropdownMenuItem>
        </>
      ) : (
        <>
          <DropdownMenuItem icon={BetweenHorizontalStart} onClick={onInsertBefore}>
            Insert above
          </DropdownMenuItem>
          <DropdownMenuItem icon={BetweenHorizontalEnd} shortcut="⌘↵" onClick={onInsertAfter}>
            Insert below
          </DropdownMenuItem>
          <DropdownMenuItem
            icon={ArrowUp}
            shortcut="⌥⇧↑"
            disabled={!onMoveBefore}
            onClick={onMoveBefore}
          >
            Move up
          </DropdownMenuItem>
          <DropdownMenuItem
            icon={ArrowDown}
            shortcut="⌥⇧↓"
            disabled={!onMoveAfter}
            onClick={onMoveAfter}
          >
            Move down
          </DropdownMenuItem>
          <DropdownMenuItem icon={CopyPlus} onClick={onDuplicate}>
            Duplicate
          </DropdownMenuItem>
        </>
      )}
      <DropdownMenuSeparator />
      <DropdownMenuItem icon={Eraser} onClick={onClear} {...preview('clear')}>
        Clear contents
      </DropdownMenuItem>
      <DropdownMenuItem
        icon={Trash2}
        variant="destructive"
        onClick={onDelete}
        {...preview('delete')}
      >
        {column ? 'Delete column' : 'Delete row'}
      </DropdownMenuItem>
    </DropdownMenuContent>
  );
}
