# ScrollThumb

A thin scrollbar for a surface whose own scrollbar is hidden: the sidebar and sheets. A 4px `border-strong` thumb with round ends, 2px from the right edge, drawn over the content so it takes no width from it. It fades in (`duration-normal`) while the surface scrolls, fades out 0.8s after scrolling stops, and never shows when nothing overflows. It doesn't take the pointer: the surface scrolls by wheel, trackpad and keyboard.

- **Track:** the surface's height, 4px in at each end; `insetTop` starts it below a pinned header (sheets: below their 48px header).
- **Use:** put it last inside the scrolling element, which needs `position: relative` and `scrollbar-width: none`.
- **`data-scrolled`:** it marks the scrolling element while it is scrolled from the top, so a pinned header can cast `shadow-pinned` (the sidebar does).

**Base UI:** none; Base UI's `ScrollArea` wraps the content in its own viewport, which would break the sidebar's pinned rows, so this draws the thumb over the existing scrolling element instead.
