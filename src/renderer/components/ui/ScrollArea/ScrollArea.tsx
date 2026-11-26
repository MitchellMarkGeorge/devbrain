import {
  forwardRef,
  useLayoutEffect,
  useMemo,
  useRef,
  type ComponentPropsWithoutRef,
  type FocusEvent,
  type Ref,
} from 'react';
import { ScrollArea as BaseScrollArea } from '@base-ui/react/scroll-area';
import { cn, mergeClassName } from '../../lib/cn';
import { mergeRefs } from '../../lib/merge-refs';
import styles from './ScrollArea.module.css';

export interface ScrollAreaProps extends BaseScrollArea.Root.Props {
  /** the scrolling element's class: the content's own layout (padding, flex, gaps) goes here */
  viewportClassName?: string;
  /** the scrolling element, whose children are the content */
  viewportRef?: Ref<HTMLDivElement>;
  /**
   * more props for the scrolling element, when it is itself a widget: a virtualized list's
   * `role="grid"`, its `aria-*`, `tabIndex` and focus handlers, a `data-slot` for the router
   */
  viewportProps?: Omit<ComponentPropsWithoutRef<'div'>, 'className' | 'children'>;
  /**
   * which way it scrolls: `vertical` (the default; content wider than the area is cut), or
   * `horizontal` (a row wider than the area, such as the board's columns, scrolled sideways under
   * a scrollbar along the bottom edge; content taller than the area is cut)
   */
  orientation?: 'vertical' | 'horizontal';
}

/**
 * A vertical scrolling area with a thin scrollbar drawn over its right edge, taking no width from
 * the content (or, with `orientation="horizontal"`, one scrolled sideways under a scrollbar over its
 * bottom edge) (the sidebar, a sheet's body, every list and page that scrolls). The scrollbar shows while the area scrolls or the
 * pointer is over it, never when nothing overflows; drag its thumb or click its track to scroll.
 * Give the area a height (or let a flex column size it); the content goes in its viewport.
 *
 * The root carries `data-overflow-y-start` while the content is scrolled from the top, for a
 * pinned header's shadow.
 * ```tsx
 * <ScrollArea className={styles.panel} viewportClassName={styles.list}>…</ScrollArea>
 * ```
 */
export const ScrollArea = forwardRef<HTMLDivElement, ScrollAreaProps>(function ScrollArea(
  {
    viewportClassName,
    viewportRef,
    viewportProps,
    orientation = 'vertical',
    className,
    children,
    ...props
  },
  ref,
) {
  const viewport = useRef<HTMLDivElement | null>(null);
  useContentResize(viewport);
  const setViewport = useMemo(() => mergeRefs(viewport, viewportRef), [viewportRef]);
  return (
    <BaseScrollArea.Root ref={ref} className={mergeClassName(styles.root, className)} {...props}>
      <BaseScrollArea.Viewport
        {...viewportProps}
        onFocus={(event) => {
          markPointerFocus(event);
          viewportProps?.onFocus?.(event);
        }}
        onBlur={(event) => {
          if (event.target === event.currentTarget) delete event.currentTarget.dataset.pointerFocus;
          viewportProps?.onBlur?.(event);
        }}
        ref={setViewport}
        className={cn(styles.viewport, viewportClassName)}
        // one way only: content reaching past the other edge is cut, not scrolled
        style={{
          ...viewportProps?.style,
          ...(orientation === 'vertical' ? { overflowX: 'hidden' } : { overflowY: 'hidden' }),
        }}
      >
        {children}
      </BaseScrollArea.Viewport>
      <BaseScrollArea.Scrollbar orientation={orientation} className={styles.scrollbar}>
        <BaseScrollArea.Thumb className={styles.thumb} />
      </BaseScrollArea.Scrollbar>
    </BaseScrollArea.Root>
  );
});

/**
 * A click on the area's content (anywhere not itself focusable) focuses the viewport, as it is
 * focusable while it overflows. Such a focus draws no ring: the browser draws it on the next key
 * pressed, so every shortcut afterwards would frame the whole area. Marked here when the viewport
 * takes focus without matching `:focus-visible` (a click, not Tab), until it loses it.
 */
function markPointerFocus(event: FocusEvent<HTMLDivElement>) {
  const viewport = event.currentTarget;
  if (event.target !== viewport) return;
  let fromPointer = false;
  try {
    fromPointer = !viewport.matches(':focus-visible');
  } catch {
    // a DOM without :focus-visible
  }
  if (fromPointer) viewport.dataset.pointerFocus = '';
}

/**
 * Base UI measures whether the area overflows when the viewport resizes or scrolls, not when its
 * content changes: a page that swaps a tall child for a short one (a project's Overview for its
 * Tasks tab, Home for a list page in the shell) left a stale scrollbar that showed on hover. This
 * watches the viewport's children and, when one resizes or they change, sends the viewport a
 * scroll event: Base UI measures again, and as the scroll position hasn't moved, the scrollbar
 * doesn't flash.
 *
 * A `display: contents` child (an `Inert`) has no box of its own, so it never resizes: its
 * children are the viewport's content, and are watched in its place.
 */
function useContentResize(viewportRef: { current: HTMLDivElement | null }) {
  useLayoutEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport || typeof ResizeObserver === 'undefined') return;
    let frame = 0;
    const measure = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => viewport.dispatchEvent(new Event('scroll')));
    };
    const resize = new ResizeObserver(measure);
    const mutation = new MutationObserver(() => {
      observeContent();
      measure();
    });
    const observe = (parent: Element) => {
      mutation.observe(parent, { childList: true });
      for (const child of parent.children) {
        if (getComputedStyle(child).display === 'contents') observe(child);
        else resize.observe(child);
      }
    };
    const observeContent = () => {
      resize.disconnect();
      mutation.disconnect();
      observe(viewport);
    };
    observeContent();
    return () => {
      cancelAnimationFrame(frame);
      resize.disconnect();
      mutation.disconnect();
    };
  }, [viewportRef]);
}
