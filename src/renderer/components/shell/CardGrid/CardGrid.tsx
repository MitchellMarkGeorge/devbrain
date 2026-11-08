import {
  forwardRef,
  useImperativeHandle,
  useRef,
  type ComponentPropsWithoutRef,
  type CSSProperties,
  type ForwardedRef,
  type ReactElement,
  type ReactNode,
} from 'react';
import { cn } from '../../lib/cn';
import { paddingBefore, useVirtualList } from '../../lib/virtual';
import { SPACING } from '../../../styles/tokens';
import { useWorkspaceShell } from '../WorkspaceShell/context';
import styles from './CardGrid.module.css';

// the space under each row of cards, as the grid's `gap` sets it between them: space-3 or space-4
const GAPS = { sm: SPACING['space-3'], md: SPACING['space-4'] } as const;

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
  scrollerProps,
  forwardedRef,
}: CardGridVirtualProps<T> & {
  columns: number;
  gap: 'sm' | 'md';
  /** the scroller element's own props: class, style, data and aria attributes */
  scrollerProps: ComponentPropsWithoutRef<'div'>;
  forwardedRef: ForwardedRef<HTMLDivElement>;
}) {
  // the grid is its own scroller, drawn here so its ref is set before the virtualizer mounts
  const scrollerRef = useRef<HTMLDivElement>(null);
  useImperativeHandle(forwardedRef, () => scrollerRef.current as HTMLDivElement, []);
  const rowCount = Math.ceil(items.length / columns);
  const virtualizer = useVirtualList({
    scrollerRef,
    name: 'CardGrid',
    count: rowCount,
    estimateSize: () => estimateRowHeight,
    getItemKey: (row) => `${columns}:${getKey(items[row * columns])}`,
    overscan: 4,
    onEndReached,
    endReachedThreshold,
  });
  const drawnRows = virtualizer.getVirtualItems();
  // The whole grid's height, so the scrollbar is the whole grid's; the drawn rows of cards flow
  // inside it, after the space the rows above them would take (paddingBefore)
  return (
    <div ref={scrollerRef} {...scrollerProps}>
      <div
        role="grid"
        aria-rowcount={Math.ceil((itemCount ?? items.length) / columns)}
        aria-colcount={columns}
        className={styles.rows}
        style={{ height: virtualizer.getTotalSize(), paddingTop: paddingBefore(drawnRows) }}
      >
        {drawnRows.map((row) => (
          <div
            key={row.key}
            ref={virtualizer.measureElement}
            data-index={row.index}
            role="row"
            aria-rowindex={row.index + 1}
            className={cn(styles.grid, styles.row)}
            style={{ paddingBottom: GAPS[gap] }}
          >
            {items.slice(row.index * columns, row.index * columns + columns).map((item, i) => (
              <div key={getKey(item)} role="gridcell" className={styles.cell}>
                {renderItem(item, row.index * columns + i)}
              </div>
            ))}
          </div>
        ))}
      </div>
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
  const { size } = useWorkspaceShell();
  const shown = size === 'compact' ? Math.min(columns, 2) : columns;
  const vars = { '--card-columns': shown, ...style } as CSSProperties;
  if (items && renderItem && getKey) {
    return (
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
        scrollerProps={
          {
            ...rest,
            'data-gap': gap,
            className: cn(styles.scroller, className),
            style: vars,
          } as ComponentPropsWithoutRef<'div'>
        }
        forwardedRef={ref}
      />
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
 * columns (README "Window sizes"). With `items` and `renderItem` it is virtualized and is its own
 * scroller: it fills the height its container gives it and scrolls under the page's header, each
 * row of cards one virtual row, measured as it draws, so a workspace with thousands of notes draws
 * a few rows. With `children` it draws them as they are.
 */
export const CardGrid = forwardRef(CardGridImpl) as <T>(
  props: CardGridProps<T> & { ref?: ForwardedRef<HTMLDivElement> },
) => ReactElement;
