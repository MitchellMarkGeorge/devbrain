import { forwardRef, type Ref } from 'react';
import { ScrollArea as BaseScrollArea } from '@base-ui/react/scroll-area';
import { cn, mergeClassName } from '../../lib/cn';
import styles from './ScrollArea.module.css';

export interface ScrollAreaProps extends BaseScrollArea.Root.Props {
  /** the scrolling element's class: the content's own layout (padding, flex, gaps) goes here */
  viewportClassName?: string;
  /** the scrolling element, whose children are the content */
  viewportRef?: Ref<HTMLDivElement>;
}

/**
 * A vertical scrolling area with a thin scrollbar drawn over its right edge, taking no width from
 * the content (the sidebar, a sheet's body). The scrollbar shows while the area scrolls or the
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
  { viewportClassName, viewportRef, className, children, ...props },
  ref,
) {
  return (
    <BaseScrollArea.Root ref={ref} className={mergeClassName(styles.root, className)} {...props}>
      <BaseScrollArea.Viewport
        ref={viewportRef}
        className={cn(styles.viewport, viewportClassName)}
        // vertical only: content wider than the area is cut, not scrolled sideways
        style={{ overflowX: 'hidden' }}
      >
        {children}
      </BaseScrollArea.Viewport>
      <BaseScrollArea.Scrollbar orientation="vertical" className={styles.scrollbar}>
        <BaseScrollArea.Thumb className={styles.thumb} />
      </BaseScrollArea.Scrollbar>
    </BaseScrollArea.Root>
  );
});
