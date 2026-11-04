import { useEffect, useRef } from 'react';
import { cn } from '../../lib/cn';
import styles from './ScrollThumb.module.css';

/** How long the thumb stays after scrolling stops. */
const LINGER = 800;

export interface ScrollThumbProps {
  /** where the track starts, in px from the top: below a pinned header, say (4 by default) */
  insetTop?: number;
  /** where the track ends, in px from the bottom (4 by default) */
  insetBottom?: number;
  className?: string;
}

/**
 * A thin scrollbar drawn over its parent while it scrolls, taking no width from the content, for
 * a surface whose own scrollbar is hidden (the sidebar, sheets). Put it last inside the scrolling
 * element, which needs `position: relative` and `scrollbar-width: none`. The thumb fades in on
 * scrolling and out 0.8s after it stops, and never shows when nothing overflows.
 *
 * It also marks the scrolling element `data-scrolled` while it is scrolled from the top, for a
 * pinned header's shadow.
 */
export function ScrollThumb({ insetTop = 4, insetBottom = 4, className }: ScrollThumbProps) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const thumb = ref.current;
    const scroller = thumb?.parentElement;
    if (!thumb || !scroller) return;
    let hide: ReturnType<typeof setTimeout> | undefined;
    let frame = 0;
    const place = () => {
      frame = 0;
      const { scrollTop, scrollHeight, clientHeight } = scroller;
      const range = scrollHeight - clientHeight;
      scroller.toggleAttribute('data-scrolled', scrollTop > 0);
      if (range <= 0) {
        thumb.style.height = '0px';
        return;
      }
      // the thumb sits in the content, so it moves down by scrollTop to stay in view
      const track = clientHeight - insetTop - insetBottom;
      const height = Math.max(24, (track * clientHeight) / scrollHeight);
      const offset = (scrollTop / range) * (track - height);
      thumb.style.height = `${height}px`;
      thumb.style.transform = `translateY(${scrollTop + insetTop + offset}px)`;
    };
    const schedule = () => {
      if (!frame) frame = requestAnimationFrame(place);
    };
    const onScroll = () => {
      schedule();
      thumb.setAttribute('data-scrolling', '');
      clearTimeout(hide);
      hide = setTimeout(() => thumb.removeAttribute('data-scrolling'), LINGER);
    };
    scroller.addEventListener('scroll', onScroll, { passive: true });
    // the content or the window changing height moves or hides the thumb too
    const observer = new ResizeObserver(schedule);
    observer.observe(scroller);
    for (const child of Array.from(scroller.children)) {
      if (child !== thumb) observer.observe(child);
    }
    place();
    return () => {
      scroller.removeEventListener('scroll', onScroll);
      observer.disconnect();
      clearTimeout(hide);
      cancelAnimationFrame(frame);
    };
  }, [insetTop, insetBottom]);
  return <div ref={ref} className={cn(styles.thumb, className)} data-scroll-thumb="" aria-hidden />;
}
