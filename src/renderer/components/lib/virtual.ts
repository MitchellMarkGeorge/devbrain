import { useEffect, useLayoutEffect, useRef, useState, type RefObject } from 'react';
import { useVirtualizer, type Range, type Virtualizer } from '@tanstack/react-virtual';

/**
 * A length token in pixels, read from the element's computed style (`--row-height` → 48), so a
 * list follows the density the tokens set. `fallback` until the element mounts, or when the
 * token is not a px length.
 */
export function useTokenLength(
  ref: RefObject<HTMLElement | null>,
  token: `--${string}`,
  fallback: number,
): number {
  const [value, setValue] = useState(fallback);
  useLayoutEffect(() => {
    const element = ref.current;
    if (!element) return;
    const parsed = parseFloat(getComputedStyle(element).getPropertyValue(token));
    if (Number.isFinite(parsed) && parsed > 0) setValue(parsed);
  }, [ref, token]);
  return value;
}

export interface VirtualListOptions {
  /** the list's own scrolling element: the rows are virtualized against it */
  scrollerRef: RefObject<HTMLElement | null>;
  count: number;
  estimateSize: (index: number) => number;
  getItemKey?: (index: number) => string | number;
  /** rows drawn beyond the visible ones, above and below (about 10) */
  overscan?: number;
  rangeExtractor?: (range: Range) => number[];
  /** called when the last rendered row comes within `endReachedThreshold` of the end */
  onEndReached?: () => void;
  /** rows from the end at which `onEndReached` fires (default 20) */
  endReachedThreshold?: number;
}

/**
 * TanStack Virtual's `useVirtualizer` on a list that is its own scroller, plus `onEndReached`:
 * it fires once the last rendered row comes within `endReachedThreshold` of the end, once for
 * each length of the list, which is where a page calls `fetchNextPage()`.
 */
export function useVirtualList({
  scrollerRef,
  count,
  estimateSize,
  getItemKey,
  overscan = 10,
  rangeExtractor,
  onEndReached,
  endReachedThreshold = 20,
}: VirtualListOptions): Virtualizer<HTMLElement, Element> {
  // TanStack Virtual returns fresh functions each render, which the React Compiler cannot memoize;
  // the lists re-render with it as its docs intend
  // eslint-disable-next-line react-hooks/incompatible-library
  const virtualizer = useVirtualizer<HTMLElement, Element>({
    count,
    estimateSize,
    getItemKey,
    overscan,
    rangeExtractor,
    getScrollElement: () => scrollerRef.current,
  });

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

  return virtualizer;
}
