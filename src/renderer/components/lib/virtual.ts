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
  /** names the component in the development warning about a list with no height to fill */
  name?: string;
}

// more rows than any window shows: a list drawing this many has not been given a height
const UNBOUNDED_ROWS = 200;

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
  name = 'A virtualized list',
}: VirtualListOptions): Virtualizer<HTMLElement, Element> {
  // The React Compiler can't memoize useVirtualizer: its result changes as the list scrolls without
  // React seeing a new value. This repo doesn't use the compiler; if it ever does, it will skip
  // this hook, which is the safe outcome, so the rule's warning tells us nothing here.
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
