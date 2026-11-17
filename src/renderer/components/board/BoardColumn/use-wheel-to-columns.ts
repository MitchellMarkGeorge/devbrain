import { useEffect, type RefObject } from 'react';

// a wheel's deltaMode: pixels, lines (a line taken as 16px) or pages
const LINE_HEIGHT = 16;
function wheelDeltaY(event: WheelEvent, page: number): number {
  if (event.deltaMode === WheelEvent.DOM_DELTA_LINE) return event.deltaY * LINE_HEIGHT;
  if (event.deltaMode === WheelEvent.DOM_DELTA_PAGE) return event.deltaY * page;
  return event.deltaY;
}

// the nearest element from `target` up to `stop` that scrolls vertically and can move by `delta`
function verticalScrollerOf(
  target: Element | null,
  stop: Element,
  delta: number,
): HTMLElement | null {
  for (let el = target; el && el !== stop; el = el.parentElement) {
    if (!(el instanceof HTMLElement)) continue;
    if (!/auto|scroll/.test(getComputedStyle(el).overflowY)) continue;
    const max = el.scrollHeight - el.clientHeight;
    if (max <= 0) continue;
    if ((delta < 0 && el.scrollTop > 0) || (delta > 0 && el.scrollTop < max)) return el;
  }
  return null;
}

/**
 * While the board scrolls sideways, a mostly-vertical wheel scrolls the column under the pointer.
 * A mouse's wheel on macOS can carry a little sideways movement, which would otherwise hand the
 * whole gesture to the board's sideways scroller and leave the column still. Shift+wheel and
 * sideways swipes still move the board.
 */
export function useWheelToColumns(viewportRef: RefObject<HTMLDivElement | null>) {
  useEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport) return;
    const onWheel = (event: WheelEvent) => {
      if (event.ctrlKey || event.shiftKey) return;
      if (viewport.scrollWidth <= viewport.clientWidth) return;
      if (Math.abs(event.deltaY) <= Math.abs(event.deltaX)) return;
      const target = event.target instanceof Element ? event.target : null;
      const column = verticalScrollerOf(target, viewport, event.deltaY);
      if (!column) return;
      event.preventDefault();
      column.scrollTop += wheelDeltaY(event, column.clientHeight);
    };
    viewport.addEventListener('wheel', onWheel, { passive: false });
    return () => viewport.removeEventListener('wheel', onWheel);
  }, [viewportRef]);
}
