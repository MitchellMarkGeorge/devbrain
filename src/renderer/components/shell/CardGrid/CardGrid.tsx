import {
  forwardRef,
  useRef,
  type ComponentPropsWithoutRef,
  type CSSProperties,
  type ForwardedRef,
  type ReactElement,
  type ReactNode,
} from 'react';
import { cn } from '../../lib/cn';
import { useListVirtualizer } from '../../lib/virtual';
import { useAppShell } from '../AppShell/context';
import styles from './CardGrid.module.css';

// the gap tokens, in px, for the virtual rows' spacing
const GAPS = { sm: 12, md: 16 } as const;

interface CardGridBaseProps extends Omit<ComponentPropsWithoutRef<'div'>, 'children'> {
  /** columns at medium and wide sizes (default 3); compact windows always use two */
  columns?: number;
  /** `sm` 12px, `md` 16px (the Notes and Projects card views) */
  gap?: 'sm' | 'md';
}

export interface CardGridStaticProps extends CardGridBaseProps {
  /** a few cards, drawn as they are (a loading state, Home) */
  children: ReactNode;
  items?: never;
}

export interface CardGridVirtualProps<T> extends CardGridBaseProps {
  /**
   * the items the cards draw (core's notes or projects): virtualized by rows, so only the rows of
   * cards in view (and a few either side) are drawn
   */
  items: T[];
  renderItem: (item: T, index: number) => ReactNode;
  /** the item's id, the card's key */
  getKey: (item: T) => string;
  /** a row of cards' height before it is measured, gap included (the Notes card: 156 + 16) */
  estimateRowHeight?: number;
  /** how many items there are in all, loaded or not (`aria-rowcount` counts rows of cards from it) */
  itemCount?: number;
  /** called when the last drawn row comes within `endReachedThreshold` rows of the end */
  onEndReached?: () => void;
  /** default 7 rows (about 20 cards at three across) */
  endReachedThreshold?: number;
  children?: never;
}

export type CardGridProps<T = unknown> = CardGridStaticProps | CardGridVirtualProps<T>;

function VirtualRows<T>({
  items,
  renderItem,
  getKey,
  estimateRowHeight = 172,
  itemCount,
  onEndReached,
  endReachedThreshold = 7,
  columns,
  gap,
}: CardGridVirtualProps<T> & { columns: number; gap: 'sm' | 'md' }) {
  const listRef = useRef<HTMLDivElement>(null);
  const rowCount = Math.ceil(items.length / columns);
  const virtualizer = useListVirtualizer({
    listRef,
    count: rowCount,
    estimateSize: () => estimateRowHeight,
    getItemKey: (row) => `${columns}:${getKey(items[row * columns])}`,
    overscan: 4,
    onEndReached,
    endReachedThreshold,
  });
  const scrollMargin = virtualizer.options.scrollMargin;
  return (
    <div
      ref={listRef}
      role="grid"
      aria-rowcount={Math.ceil((itemCount ?? items.length) / columns)}
      aria-colcount={columns}
      className={styles.rows}
      style={{ height: virtualizer.getTotalSize() }}
    >
      {virtualizer.getVirtualItems().map((row) => (
        <div
          key={row.key}
          ref={virtualizer.measureElement}
          data-index={row.index}
          role="row"
          aria-rowindex={row.index + 1}
          className={cn(styles.grid, styles.row)}
          style={{
            transform: `translateY(${row.start - scrollMargin}px)`,
            paddingBottom: GAPS[gap],
          }}
        >
          {items.slice(row.index * columns, row.index * columns + columns).map((item, i) => (
            <div key={getKey(item)} role="gridcell" className={styles.cell}>
              {renderItem(item, row.index * columns + i)}
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}

function CardGridImpl<T>(props: CardGridProps<T>, ref: ForwardedRef<HTMLDivElement>) {
  const {
    columns = 3,
    gap = 'sm',
    className,
    style,
    items,
    renderItem,
    getKey,
    estimateRowHeight,
    itemCount,
    onEndReached,
    endReachedThreshold,
    children,
    ...rest
  } = props as CardGridStaticProps & Partial<Omit<CardGridVirtualProps<T>, 'children'>>;
  const { size } = useAppShell();
  const shown = size === 'compact' ? Math.min(columns, 2) : columns;
  const vars = { '--card-columns': shown, ...style } as CSSProperties;
  if (items && renderItem && getKey) {
    return (
      <div ref={ref} data-gap={gap} className={className} style={vars} {...rest}>
        <VirtualRows
          items={items}
          renderItem={renderItem}
          getKey={getKey}
          estimateRowHeight={estimateRowHeight}
          itemCount={itemCount}
          onEndReached={onEndReached}
          endReachedThreshold={endReachedThreshold}
          columns={shown}
          gap={gap}
        />
      </div>
    );
  }
  return (
    <div ref={ref} data-gap={gap} className={cn(styles.grid, className)} style={vars} {...rest}>
      {children}
    </div>
  );
}

/**
 * Cards in equal columns: the Notes and Projects card views. In compact windows it drops to two
 * columns (README "Window sizes"). With `items` and `renderItem` it is virtualized: each row of
 * cards is one virtual row, measured as it draws, so a workspace with thousands of notes draws a
 * few rows. With `children` it draws them as they are.
 */
export const CardGrid = forwardRef(CardGridImpl) as <T>(
  props: CardGridProps<T> & { ref?: ForwardedRef<HTMLDivElement> },
) => ReactElement;
