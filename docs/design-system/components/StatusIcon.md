# StatusIcon

A task's status (core's `TaskStatus`) as a 16px icon (12px inside badges): `NOT_STARTED` circle, `IN_PROGRESS` activity line, `COMPLETED` filled check, `CANCELLED` slashed circle, and with `overdue` the flag.

- Props: `status: TaskStatus`, `overdue?: boolean`, `size`. Overdue is not a status: the caller works it out from the status, the due date and `now` (`isOverdue` in `types.ts`) and passes `overdue` only while `showsOverdueFlag` holds: overdue and not started. An overdue task in progress keeps its activity line, with its date in `date-overdue`.
- Colours: `status-*` tokens (`status-overdue` for the flag). Each state has its own shape, so colour is never the only signal.
- It carries the status's name ("Overdue" for the flag) for screen readers.
- In a row, clicking it opens the status menu.
