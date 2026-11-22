# LinkedTaskRow

The compact task row of a sheet's Subtasks and Linked tasks and of a note's linked tasks: 36px, 8px in from the sides, 8px corners, a grid of named areas as the list rows' (`status`, `title`, `date`, 8px apart). The status icon (16px, in a 20px button that opens the `StatusMenu`; a synced task's is the icon alone in the same slot, with no menu), the title in 14px `foreground`, then the due date right-aligned in a 60px column, as a task row's, so dates line up down the list: from `formatListDate`, always the date ("Jun 24"; "Dec 2025" when not this year's), or "No date" (`NO_DATE_LABEL`), in 12px `subtle-foreground` (`date-today` when an open task is due today, `date-overdue` when it is overdue, from `dueTone`). No checkbox and no pills. Hover and keyboard focus fill it with `row-selected`, like the strokeless list rows; clicking the row or Enter opens the task. `state` draws hover or focus for pictures.

`task`: core's task as it is (`LinkedTaskRowData`, a `Pick<Task, 'title' | 'status' | 'dueDate'>`). With `onStatusChange` the status is controlled (`task.status`); without it the row keeps its own pick.

**Base UI:** `Menu` through `StatusMenu` for the status button.
