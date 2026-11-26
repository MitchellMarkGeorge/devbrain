import { forwardRef, type ComponentPropsWithoutRef, type FocusEvent, type Ref } from 'react';
import { ScrollArea as BaseScrollArea } from '@base-ui/react/scroll-area';
import { cn, mergeClassName } from '../../lib/cn';
import styles from './ScrollArea.module.css';

export interface ScrollAreaProps extends BaseScrollArea.Root.Props {
  /**
   * the content's class: its own layout (padding, flex, gaps) goes here. The content is one element
   * in the scrolling one, at least as tall as the area (as wide, scrolled sideways), holding the
   * children
   */
  contentClassName?: string;
  /** the scrolling element, which holds the content */
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
 * Give the area a height (or let a flex column size it); the children go in its content, which
 * grows with them and is measured as it does, so the scrollbar follows what is in the area.
 *
 * The root carries `data-overflow-y-start` while the content is scrolled from the top, for a
 * pinned header's shadow.
 * ```tsx
 * <ScrollArea className={styles.panel} contentClassName={styles.list}>…</ScrollArea>
 * ```
 */
export const ScrollArea = forwardRef<HTMLDivElement, ScrollAreaProps>(function ScrollArea(
  {
    contentClassName,
    viewportRef,
    viewportProps,
    orientation = 'vertical',
    className,
    children,
    ...props
  },
  ref,
) {
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
        ref={viewportRef}
        className={styles.viewport}
        // one way only: content reaching past the other edge is cut, not scrolled
        style={{
          ...viewportProps?.style,
          ...(orientation === 'vertical' ? { overflowX: 'hidden' } : { overflowY: 'hidden' }),
        }}
      >
        {/*
         * Base UI measures the overflow again when the content resizes, so a page swapping a tall
         * child for a short one leaves no stale scrollbar. It makes the content at least as wide as
         * what is in it; scrolled down, the content keeps to the area's width instead, so a long
         * line is cut (or truncates) as it would in the viewport itself.
         */}
        <BaseScrollArea.Content
          className={cn(styles.content, contentClassName)}
          data-orientation={orientation}
          style={orientation === 'vertical' ? { minWidth: 0 } : undefined}
        >
          {children}
        </BaseScrollArea.Content>
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
