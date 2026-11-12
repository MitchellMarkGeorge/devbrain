import {
  forwardRef,
  useLayoutEffect,
  useMemo,
  useRef,
  type ComponentPropsWithoutRef,
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
}

/**
 * A vertical scrolling area with a thin scrollbar drawn over its right edge, taking no width from
 * the content (the sidebar, a sheet's body, every list and page that scrolls). The scrollbar shows while the area scrolls or the
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
  { viewportClassName, viewportRef, viewportProps, className, children, ...props },
  ref,
) {
  const viewport = useRef<HTMLDivElement | null>(null);
  useContentResize(viewport);
  const setViewport = useMemo(() => mergeRefs(viewport, viewportRef), [viewportRef]);
  return (
    <BaseScrollArea.Root ref={ref} className={mergeClassName(styles.root, className)} {...props}>
      <BaseScrollArea.Viewport
        {...viewportProps}
        ref={setViewport}
        className={cn(styles.viewport, viewportClassName)}
        // vertical only: content wider than the area is cut, not scrolled sideways
        style={{ ...viewportProps?.style, overflowX: 'hidden' }}
      >
        {children}
      </BaseScrollArea.Viewport>
      <BaseScrollArea.Scrollbar orientation="vertical" className={styles.scrollbar}>
        <BaseScrollArea.Thumb className={styles.thumb} />
      </BaseScrollArea.Scrollbar>
    </BaseScrollArea.Root>
  );
});

/**
 * Base UI measures whether the area overflows when the viewport resizes or scrolls, not when its
 * content changes: a page that swaps a tall child for a short one (a project's Overview for its
 * Tasks tab, Home for a list page in the shell) left a stale scrollbar that showed on hover. This
 * watches the viewport's children and, when one resizes or they change, sends the viewport a
 * scroll event: Base UI measures again, and as the scroll position hasn't moved, the scrollbar
 * doesn't flash.
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
    const observeChildren = () => {
      resize.disconnect();
      for (const child of viewport.children) resize.observe(child);
    };
    observeChildren();
    const mutation = new MutationObserver(() => {
      observeChildren();
      measure();
    });
    mutation.observe(viewport, { childList: true });
    return () => {
      cancelAnimationFrame(frame);
      resize.disconnect();
      mutation.disconnect();
    };
  }, [viewportRef]);
}
