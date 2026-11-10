import { useRef, type ReactNode } from 'react';
import { cn } from '../../lib/cn';
import { paddingBefore, useVirtualList } from '../../lib/virtual';
import { SIZE } from '../../../styles/tokens';
import { ScrollArea } from '../../ui/ScrollArea';
import styles from './VirtualList.module.css';

export interface VirtualListProps<T> {
  /** core's rows, as they are */
  items: T[];
  /** draws one item: a `ListRow` or a row built on it (`ProjectRow`, `NoteRow`) */
  renderItem: (item: T, index: number) => ReactNode;
  /** the item's id, its row's key */
  getKey: (item: T) => string;
  /** a row's height before it is measured (`row-height`, 48px, by default) */
  estimateRowHeight?: number;
  /** how many items there are in all, loaded or not (`aria-rowcount`) */
  itemCount?: number;
  /** called when the last drawn row comes within `endReachedThreshold` rows of the end */
  onEndReached?: () => void;
  /** default 20 rows */
  endReachedThreshold?: number;
  className?: string;
  'aria-label'?: string;
}

/**
 * A long list of rows: the Projects list (and any list of `ListRow`s) over all of a workspace's
 * rows. It is its own scroller, filling the height its container gives it, and draws only the rows
 * in view, each measured as it draws. Each item renders its own `role="row"`.
 */
export function VirtualList<T>({
  items,
  renderItem,
  getKey,
  estimateRowHeight = SIZE['row-height'],
  itemCount,
  onEndReached,
  endReachedThreshold = 20,
  className,
  'aria-label': ariaLabel,
}: VirtualListProps<T>) {
  const scrollerRef = useRef<HTMLDivElement>(null);
  const virtualizer = useVirtualList({
    scrollerRef,
    count: items.length,
    estimateSize: () => estimateRowHeight,
    getItemKey: (index) => getKey(items[index]),
    onEndReached,
    endReachedThreshold,
  });
  const rows = virtualizer.getVirtualItems();
  return (
    <ScrollArea
      className={cn(styles.scroller, className)}
      viewportRef={scrollerRef}
      viewportClassName={styles.viewport}
    >
      <div
        role="grid"
        aria-label={ariaLabel}
        aria-rowcount={itemCount ?? items.length}
        className={styles.rows}
        style={{ height: virtualizer.getTotalSize(), paddingTop: paddingBefore(rows) }}
      >
        {rows.map((row) => (
          <div key={row.key} ref={virtualizer.measureElement} data-index={row.index} role="none">
            {renderItem(items[row.index], row.index)}
          </div>
        ))}
      </div>
    </ScrollArea>
  );
}
