# LinkedTaskRow

The compact task row of a sheet's Subtasks and Linked tasks and of a note's linked tasks: 36px, 8px in from the sides, 8px corners. The status icon (16px, in a 20px button that opens the `StatusMenu`, its target 24px (WCAG 2.5.8) with the 2px either side taken back from the row's gaps; the flag while the task is overdue and not started), the title in 14px `foreground`, then the due date from `formatDue` ("Today", "In 3 days", "Jun 24") in 12px `subtle-foreground` (`date-today` when an open task is due today, `date-overdue` when it is overdue, from `dueTone`). No checkbox and no pills. Hover and keyboard focus fill it with `row-selected`, like the strokeless list rows; clicking the row opens the task. With `onOpen` the title is a button (Enter or Space on it opens the task, and its focus rings the whole row); the row itself is not one, as a button cannot hold the status button. So a row is two tab stops: the status, then the title. `state` draws hover or focus for pictures.

`task`: core's task as it is (`LinkedTaskRowData`, a `Pick<Task, 'title' | 'status' | 'dueDate'>`). With `onStatusChange` the status is controlled (`task.status`); without it the row keeps its own pick.

**Base UI:** `Menu` through `StatusMenu` for the status button.
