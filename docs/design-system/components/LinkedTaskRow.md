# LinkedTaskRow

The compact task row of a sheet's Subtasks and Linked tasks and of a note's linked tasks: 36px, 8px in from the sides, 8px corners. The status icon (16px, in a 20px button that opens the `StatusMenu`; the flag while the task is overdue and not started), the title in 14px `foreground`, then the due date from `formatDue` ("Today", "In 3 days", "Jun 24") in 12px `subtle-foreground` (`date-today` when an open task is due today, `date-overdue` when it is overdue, from `dueTone`). No checkbox and no pills. Hover and keyboard focus fill it with `row-selected`, like the strokeless list rows; clicking the row or Enter opens the task. `state` draws hover or focus for pictures.

`task`: core's task as it is (`LinkedTaskRowData`, a `Pick<Task, 'title' | 'status' | 'dueDate'>`). With `onStatusChange` the status is controlled (`task.status`); without it the row keeps its own pick.

**Base UI:** `Menu` through `StatusMenu` for the status button.
