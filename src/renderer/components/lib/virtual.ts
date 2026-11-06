import { useCallback, useEffect, useLayoutEffect, useRef, useState, type RefObject } from 'react';
import {
  useVirtualizer,
  useWindowVirtualizer,
  type Range,
  type Virtualizer,
} from '@tanstack/react-virtual';

/**
 * The element that scrolls `element`: its nearest ancestor with `overflow-y` auto or scroll, or
 * null when the page itself scrolls.
 */
export function scrollParentOf(element: HTMLElement | null): HTMLElement | null {
  for (let node = element?.parentElement; node; node = node.parentElement) {
    if (node === document.body || node === document.documentElement) return null;
    const { overflowY } = getComputedStyle(node);
    if (overflowY === 'auto' || overflowY === 'scroll' || overflowY === 'overlay') return node;
  }
  return null;
}

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

export interface ListVirtualizerOptions {
  /** the list's own element: its scrolling ancestor (or the window) drives the virtualizer */
  listRef: RefObject<HTMLElement | null>;
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

export type ListVirtualizer = Virtualizer<HTMLElement, Element> | Virtualizer<Window, Element>;

/**
 * Virtualizes a list that sits inside a larger scrolling area (a page, a sheet) rather than being
 * its own scroller: it finds the list's scrolling ancestor, or uses the window, and offsets the
 * rows by where the list starts in it (`scrollMargin`). Rows are placed at
 * `item.start - virtualizer.options.scrollMargin`.
 */
export function useListVirtualizer({
  listRef,
  count,
  estimateSize,
  getItemKey,
  overscan = 10,
  rangeExtractor,
  onEndReached,
  endReachedThreshold = 20,
}: ListVirtualizerOptions): ListVirtualizer {
  // undefined until mounted; null when the window scrolls
  const [scroller, setScroller] = useState<HTMLElement | null | undefined>(undefined);
  const [scrollMargin, setScrollMargin] = useState(0);

  useLayoutEffect(() => {
    setScroller(scrollParentOf(listRef.current));
  }, [listRef]);

  // where the list starts in its scroller, kept up to date as what is above it changes size
  const measureMargin = useCallback(() => {
    const list = listRef.current;
    if (!list || scroller === undefined) return;
    const top = list.getBoundingClientRect().top;
    const margin = scroller
      ? top - scroller.getBoundingClientRect().top + scroller.scrollTop
      : top + window.scrollY;
    setScrollMargin((current) => (Math.abs(current - margin) < 0.5 ? current : margin));
  }, [listRef, scroller]);
  useLayoutEffect(() => {
    measureMargin();
    const target = scroller ?? document.body;
    const observer = new ResizeObserver(measureMargin);
    observer.observe(target);
    if (listRef.current?.parentElement) observer.observe(listRef.current.parentElement);
    return () => observer.disconnect();
  }, [measureMargin, scroller, listRef]);

  const shared = { count, estimateSize, getItemKey, overscan, rangeExtractor, scrollMargin };
  // TanStack Virtual returns fresh functions each render, which the React Compiler cannot memoize;
  // the lists re-render with it as its docs intend
  // eslint-disable-next-line react-hooks/incompatible-library
  const inElement = useVirtualizer<HTMLElement, Element>({
    ...shared,
    enabled: scroller != null,
    getScrollElement: () => scroller ?? null,
  });
  const inWindow = useWindowVirtualizer({ ...shared, enabled: scroller === null });
  const virtualizer: ListVirtualizer = scroller === null ? inWindow : inElement;

  // ask for more once the last rendered row is near the end, once per count
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
