# StatusIcon

A task's status (core's `TaskStatus`) as a 16px icon (12px inside badges): `NOT_STARTED` circle, `IN_PROGRESS` circle with a solid core (`CoreCircle`), `COMPLETED` filled check, `CANCELLED` slashed circle.

- Props: `status: TaskStatus`, `size`. Overdue is not a status and the icon does not show it: an overdue task keeps its status icon, and its date shows it, in `date-overdue` (`dueTone` in `types.ts`).
- Colours: `status-*` tokens. Each state has its own shape, so colour is never the only signal.
- It carries the status's name for screen readers.
- In a row, clicking it opens the status menu.
