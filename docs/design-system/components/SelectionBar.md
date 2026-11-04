# SelectionBar

Floats over the bottom of a list while rows are selected: the count (14px medium), a divider, then `ghost` sm actions for Status, Priority, Due date and Move (16px icons, 13px labels in `foreground`), and the "more" and clear icon buttons in `muted-foreground` until pointed at. Nova's floating surface: `popover`, the `edge` outline, 14px corners, `shadow-2xl`. `TaskList` shows it on its own.

- On a page it sits 16px above the window's bottom edge, centred over the page; a grouped list shows one bar for the whole page (`TaskList selectionBar={false}`).
