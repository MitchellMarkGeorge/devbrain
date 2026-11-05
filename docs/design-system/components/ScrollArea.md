# ScrollArea

A vertical scrolling area with a thin scrollbar drawn over its right edge, taking no width from the content: the sidebar and a sheet's body. The native scrollbar is hidden.

- **Scrollbar.** An 8px strip on the right edge holding a 4px `border-strong` thumb with round ends, 2px in from the edge and 4px from each end (at least 16px tall). It isn't drawn when nothing overflows.
- **Showing.** It fades in (`duration-normal`) while the area scrolls or the pointer is over it, and fades out 0.8s after scrolling stops or once the pointer leaves.
- **Dragging.** The scrollbar is a control: drag the thumb to scroll, or click the track above or below it to jump there. The wheel, trackpad and keyboard scroll the area as usual.
- **Keyboard.** While it overflows, the area takes keyboard focus (the arrow keys then scroll it), shown as a 1px `ring` outline inside its edge.
- **Vertical only.** Content wider than the area is cut off rather than scrolled sideways.
- **Use.** Give the area a height, or let a flex column size it (`ScrollArea` is a flex column whose viewport takes the spare height). The content goes in its viewport: put the content's own layout on `viewportClassName`, or in an element inside. A row pinned with `position: sticky` stays pinned inside the viewport.
- **`data-overflow-y-start`:** the root carries it while the content is scrolled from the top, so a pinned header can cast `shadow-pinned` (the sidebar's does).

**Base UI:** `ScrollArea.Root`, `ScrollArea.Viewport`, `ScrollArea.Scrollbar` (vertical) and `ScrollArea.Thumb`. Styles key off `data-scrolling` and `data-hovering` on the scrollbar and `data-overflow-y-start` on the root.
