import { forwardRef } from 'react';
import { Toolbar } from '@base-ui/react/toolbar';
import { Toggle } from '@base-ui/react/toggle';
import { Copy, Eraser, PanelTop, Trash2 } from 'lucide-react';
import { cn } from '../../lib/cn';
import { Icon } from '../../ui/Icon';
import { Tooltip } from '../../ui/Tooltip';
import { FormatToolbarButton, FormatToolbarRoot, FormatToolbarSeparator } from '../FormatToolbar';
import { TABLE_ALIGNMENTS, type TableAlignment } from '../TableMenu';
import styles from './TableToolbar.module.css';

export interface TableToolbarProps extends Omit<Toolbar.Root.Props, 'children'> {
  /** the first row is the header: the Header row switch is on */
  headerRow: boolean;
  onHeaderRowChange?: (headerRow: boolean) => void;
  rows: number;
  cols: number;
  /** copies the table's Markdown */
  onCopy?: () => void;
  onDelete?: () => void;
  /** Delete table is pointed at (true) or left (false), for the editor to tint every cell */
  onDeletePreviewChange?: (previewing: boolean) => void;
}

/**
 * The bar over a table's top right corner while you work in it: the Header row switch, the size
 * (columns × rows, in mono), then Copy as Markdown and Delete table. The same `popover` strip as
 * the `FormatToolbar`. The editor positions it; this draws it.
 */
export const TableToolbar = forwardRef<HTMLDivElement, TableToolbarProps>(function TableToolbar(
  { headerRow, onHeaderRowChange, rows, cols, onCopy, onDelete, onDeletePreviewChange, ...props },
  ref,
) {
  return (
    <FormatToolbarRoot ref={ref} aria-label="Table" {...props}>
      <Tooltip content="The first row is the table’s header" side="top">
        <Toolbar.Button
          className={styles.textButton}
          render={
            <Toggle
              pressed={headerRow}
              onPressedChange={(pressed) => onHeaderRowChange?.(pressed)}
            />
          }
        >
          <Icon icon={PanelTop} size={16} />
          <span>Header row</span>
          <span className={styles.switch} aria-hidden />
        </Toolbar.Button>
      </Tooltip>
      <FormatToolbarSeparator />
      <span className={styles.size} aria-label={`${cols} columns, ${rows} rows`}>
        {cols} × {rows}
      </span>
      <FormatToolbarSeparator />
      <FormatToolbarButton icon={Copy} label="Copy as Markdown" onClick={onCopy} />
      <FormatToolbarButton
        icon={Trash2}
        label="Delete table"
        className={styles.destructive}
        onClick={onDelete}
        onPointerEnter={() => onDeletePreviewChange?.(true)}
        onPointerLeave={() => onDeletePreviewChange?.(false)}
        onFocus={() => onDeletePreviewChange?.(true)}
        onBlur={() => onDeletePreviewChange?.(false)}
      />
    </FormatToolbarRoot>
  );
});

/** What a button of the cell toolbar would change, for the editor to tint those cells. */
export type TableCellPreview = 'clear' | 'rows' | 'columns';

export interface TableCellToolbarProps extends Omit<Toolbar.Root.Props, 'children'> {
  /** the selected block's size */
  rows: number;
  cols: number;
  /** the selected columns' alignment, or null when they differ */
  align: TableAlignment | null;
  onAlignChange?: (align: TableAlignment) => void;
  onClear?: () => void;
  onDeleteRows?: () => void;
  onDeleteColumns?: () => void;
  onPreviewChange?: (preview: TableCellPreview | null) => void;
}

/**
 * The bar under a block of selected cells: its size, the alignment of its columns (Markdown
 * keeps one a column, so it aligns the whole columns), Clear, then Delete rows and Delete
 * columns. ⌫ clears the cells too.
 */
export const TableCellToolbar = forwardRef<HTMLDivElement, TableCellToolbarProps>(
  function TableCellToolbar(
    {
      rows,
      cols,
      align,
      onAlignChange,
      onClear,
      onDeleteRows,
      onDeleteColumns,
      onPreviewChange,
      ...props
    },
    ref,
  ) {
    const preview = (kind: TableCellPreview) => ({
      onPointerEnter: () => onPreviewChange?.(kind),
      onPointerLeave: () => onPreviewChange?.(null),
      onFocus: () => onPreviewChange?.(kind),
      onBlur: () => onPreviewChange?.(null),
    });
    return (
      <FormatToolbarRoot ref={ref} aria-label="Selected cells" {...props}>
        <span className={styles.size} aria-label={`${cols} columns, ${rows} rows selected`}>
          {cols} × {rows}
        </span>
        <FormatToolbarSeparator />
        {TABLE_ALIGNMENTS.map((option) => (
          <FormatToolbarButton
            key={option.value}
            icon={option.icon}
            label={`${option.label} (whole columns)`}
            render={
              <Toggle
                pressed={align === option.value}
                onPressedChange={() => onAlignChange?.(option.value)}
              />
            }
          />
        ))}
        <FormatToolbarSeparator />
        <FormatToolbarButton
          icon={Eraser}
          label="Clear"
          keys="⌫"
          onClick={onClear}
          {...preview('clear')}
        />
        <FormatToolbarSeparator />
        <Toolbar.Button
          className={cn(styles.textButton, styles.destructive)}
          onClick={onDeleteRows}
          {...preview('rows')}
        >
          {rows > 1 ? 'Delete rows' : 'Delete row'}
        </Toolbar.Button>
        <Toolbar.Button
          className={cn(styles.textButton, styles.destructive)}
          onClick={onDeleteColumns}
          {...preview('columns')}
        >
          {cols > 1 ? 'Delete columns' : 'Delete column'}
        </Toolbar.Button>
      </FormatToolbarRoot>
    );
  },
);
