import { useEffect, useRef, type RefObject } from 'react';
import {
  useVirtualizer,
  type Range,
  type VirtualItem,
  type Virtualizer,
} from '@tanstack/react-virtual';

export interface VirtualListOptions {
  /** the list's own scrolling element: the rows are virtualized against it */
  scrollerRef: RefObject<HTMLElement | null>;
  count: number;
  estimateSize: (index: number) => number;
  /** the space between rows, which the list draws as its CSS `gap` (0 by default) */
  gap?: number;
  getItemKey?: (index: number) => string | number;
  /** rows drawn beyond the visible ones, above and below (about 10) */
  overscan?: number;
  rangeExtractor?: (range: Range) => number[];
  /** called when the last rendered row comes within `endReachedThreshold` of the end */
  onEndReached?: () => void;
  /** rows from the end at which `onEndReached` fires (default 20) */
  endReachedThreshold?: number;
  /** names the component in the development warning about a list with no height to fill */
  name?: string;
}

// more rows than any window shows: a list drawing this many has not been given a height
const UNBOUNDED_ROWS = 200;

/**
 * TanStack Virtual's `useVirtualizer` on a list that is its own scroller, plus `onEndReached`:
 * it fires once the last rendered row comes within `endReachedThreshold` of the end, once for
 * each length of the list, which is where a page calls `fetchNextPage()`.
 *
 * The list draws its rows in normal flow, not positioned: a box `getTotalSize()` tall (so the
 * scrollbar is the whole list's), padded at the top by the first drawn row's `start`
 * (`paddingBefore`), then the drawn rows one after another in index order.
 */
export function useVirtualList({
  scrollerRef,
  count,
  estimateSize,
  gap = 0,
  getItemKey,
  overscan = 10,
  rangeExtractor,
  onEndReached,
  endReachedThreshold = 20,
  name = 'A virtualized list',
}: VirtualListOptions): Virtualizer<HTMLElement, Element> {
  // The React Compiler can't memoize useVirtualizer: its result changes as the list scrolls without
  // React seeing a new value. This repo doesn't use the compiler; if it ever does, it will skip
  // this hook, which is the safe outcome, so the rule's warning tells us nothing here.
  // eslint-disable-next-line react-hooks/incompatible-library
  const virtualizer = useVirtualizer<HTMLElement, Element>({
    count,
    estimateSize,
    gap,
    getItemKey,
    overscan,
    rangeExtractor,
    getScrollElement: () => scrollerRef.current,
  });

  // Ask for more once the last drawn row is within the threshold of the end. A page's callback
  // changes every render, so the latest one is kept in a ref rather than re-running the check for
  // it. It is asked once per length of the list: scrolling about near the end asks no more, and
  // asks again once the next page has made the list longer.
  const items = virtualizer.getVirtualItems();
  const last = items.length ? items[items.length - 1].index : -1;
  const askedAt = useRef(-1);
  const onEnd = useRef(onEndReached);
  useEffect(() => {
    onEnd.current = onEndReached;
  });
  useEffect(() => {
    if (!onEnd.current || count === 0 || last < 0) return;
    if (last >= count - 1 - endReachedThreshold && askedAt.current !== count) {
      askedAt.current = count;
      onEnd.current();
    }
  }, [last, count, endReachedThreshold]);

  // In development, say when the list draws every row because nothing gave it a height to fill
  // (its container is sized by its content, so the list grows and never scrolls itself)
  const drawn = items.length;
  const warned = useRef(false);
  useEffect(() => {
    if (!import.meta.env.DEV || warned.current || drawn < UNBOUNDED_ROWS) return;
    const scroller = scrollerRef.current;
    if (!scroller || scroller.scrollHeight > scroller.clientHeight + 1) return;
    warned.current = true;
    console.warn(
      `${name} is drawing ${drawn} rows at once: it has no height to fill, so it grows to its ` +
        'rows instead of scrolling them. Give it one: put it in a flex column (a PageContent, or ' +
        'display: flex; flex-direction: column with min-height: 0) or a set height.',
    );
  }, [drawn, scrollerRef, name]);

  return virtualizer;
}

/**
 * The space above the drawn rows, so each sits where its offset says while the rows flow: the
 * first drawn row's start, less the height of any row drawn ahead of it out of order (a sticky
 * heading kept from further up).
 */
export function paddingBefore(items: readonly VirtualItem[]): number {
  if (items.length === 0) return 0;
  let index = 0;
  let ahead = 0;
  while (index + 1 < items.length && items[index + 1].index !== items[index].index + 1) {
    ahead += items[index].size;
    index += 1;
  }
  return Math.max(0, items[index].start - ahead);
}
