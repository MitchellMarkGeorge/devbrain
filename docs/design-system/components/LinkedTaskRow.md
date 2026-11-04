# LinkedTaskRow

The compact task row of a sheet's Subtasks and Linked tasks and of a note's linked tasks: 36px, 8px in from the sides, 8px corners. The status icon (16px, in a 20px button that opens the `StatusMenu`), the title in 14px `foreground`, then the date in 12px `subtle-foreground` (`date-today` for "Today", `date-overdue` when late). No checkbox and no pills. Hover and keyboard focus fill it with `row-selected`, like the strokeless list rows; clicking the row or Enter opens the task. `state` draws hover or focus for pictures.

**Base UI:** `Menu` through `StatusMenu` for the status button.
