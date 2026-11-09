import { useRef, type ReactNode } from 'react';
import { cn } from '../../lib/cn';
import { paddingBefore, useVirtualList } from '../../lib/virtual';
import { SPACING } from '../../../styles/tokens';
import { CardGrid } from '../CardGrid';
import { useWorkspaceShell } from '../WorkspaceShell/context';
import { ScrollArea } from '../../ui/ScrollArea';
import styles from './VirtualCardGrid.module.css';

// the space under each row of cards: CardGrid's gap between them, space-3 or space-4
const GAPS = { sm: SPACING['space-3'], md: SPACING['space-4'] } as const;

export interface VirtualCardGridProps<T> {
  /** core's notes or projects, as they are */
  items: T[];
  renderItem: (item: T, index: number) => ReactNode;
  /** the item's id, the card's key */
  getKey: (item: T) => string;
  /** columns at medium and wide sizes (default 3); compact windows always use two */
  columns?: number;
  /** `sm` 12px, `md` 16px (the Notes and Projects card views) */
  gap?: 'sm' | 'md';
  /** a row of cards' height before it is measured, gap included (the Notes card: 156 + 16) */
  estimateRowHeight?: number;
  /** how many items there are in all, loaded or not (`aria-rowcount` counts rows of cards from it) */
  itemCount?: number;
  /** called when the last drawn row comes within `endReachedThreshold` rows of the end */
  onEndReached?: () => void;
  /** default 7 rows (about 20 cards at three across) */
  endReachedThreshold?: number;
  className?: string;
  'aria-label'?: string;
}

/**
 * A long `CardGrid`: the Notes and Projects card views over all of a workspace's notes or projects.
 * It is its own scroller, filling the height its container gives it, and draws only the rows of
 * cards in view: each row is a `CardGrid` of that many cards, one virtual row, measured as it draws.
 */
export function VirtualCardGrid<T>({
  items,
  renderItem,
  getKey,
  columns = 3,
  gap = 'sm',
  estimateRowHeight = 172,
  itemCount,
  onEndReached,
  endReachedThreshold = 7,
  className,
  'aria-label': ariaLabel,
}: VirtualCardGridProps<T>) {
  const scrollerRef = useRef<HTMLDivElement>(null);
  // the columns shown, as CardGrid works them out: two in compact windows
  const { size } = useWorkspaceShell();
  const shown = size === 'compact' ? Math.min(columns, 2) : columns;
  const virtualizer = useVirtualList({
    scrollerRef,
    count: Math.ceil(items.length / shown),
    estimateSize: () => estimateRowHeight,
    // a row is known by its first card and the column count, so a new count measures afresh
    getItemKey: (row) => `${shown}:${getKey(items[row * shown])}`,
    overscan: 4,
    onEndReached,
    endReachedThreshold,
  });
  const rows = virtualizer.getVirtualItems();

  // The whole grid's height, so the scrollbar is the whole grid's; the drawn rows of cards flow
  // inside it, after the space the rows above them would take (paddingBefore)
  return (
    // a ScrollArea: the scrollbar is drawn over the grid's edge, taking no width
    <ScrollArea
      className={cn(styles.scroller, className)}
      viewportRef={scrollerRef}
      viewportClassName={styles.viewport}
    >
      <div
        role="grid"
        aria-label={ariaLabel}
        aria-rowcount={Math.ceil((itemCount ?? items.length) / shown)}
        aria-colcount={shown}
        className={styles.rows}
        style={{ height: virtualizer.getTotalSize(), paddingTop: paddingBefore(rows) }}
      >
        {rows.map((row) => (
          <CardGrid
            key={row.key}
            ref={virtualizer.measureElement}
            data-index={row.index}
            role="row"
            aria-rowindex={row.index + 1}
            columns={shown}
            gap={gap}
            style={{ paddingBottom: GAPS[gap] }}
          >
            {items.slice(row.index * shown, row.index * shown + shown).map((item, i) => (
              <div key={getKey(item)} role="gridcell" className={styles.cell}>
                {renderItem(item, row.index * shown + i)}
              </div>
            ))}
          </CardGrid>
        ))}
      </div>
    </ScrollArea>
  );
}
