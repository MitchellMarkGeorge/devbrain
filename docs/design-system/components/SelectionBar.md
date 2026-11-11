# SelectionBar

Floats over the bottom of a list while rows are selected: the count (14px medium), a divider, then `ghost` sm actions for Status, Priority, Due date and Move (16px icons, 13px labels in `foreground`), and the "more" and clear icon buttons in `muted-foreground` until pointed at. Nova's floating surface: `popover`, the `edge` outline, 14px corners, `shadow-2xl`. `TaskList` shows it on its own.

- **Showing and hiding:** keep it mounted and drive `open` (true while rows are selected). It rises 8px and fades in over `duration-normal` with `ease-out`, and sinks back and fades out the same way, still showing its last count and actions while it goes; then it unmounts. Leaving, it is `inert`: it takes no clicks and gives up focus, so the page puts focus back on its list (Clear does). With reduced motion it appears and goes at once.
- On a page it sits 16px above the window's bottom edge, centred over the page; a grouped list shows one bar for the whole page (`TaskList selectionBar={false}`).
