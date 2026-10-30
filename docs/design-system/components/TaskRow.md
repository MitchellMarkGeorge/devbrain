# TaskRow

One task in a strokeless list: no line beneath, a `row-height` (48px) row with 8px corners that takes `accent` on hover, and its own selected tone.

- **Leading control.** The status icon is a button: click it (or press `S` on a focused row) for the `StatusMenu`, then `1`, `2` or `3`. The selection checkbox sits in a strip to its left and shows on hover, on keyboard focus, and on every row while any row is selected (`X` toggles the focused row).
- **Title first.** The name in 14px `foreground-strong`, then the issue key (12px `subtle-foreground`) and the subtask count (`corner-down-right` 3/4) after it.
- **Right side.** `EntityPill` chips (the project, its folder icon in `projectColor`, then the linked event or note), `PriorityIcon`, and the date (`date-today`, `date-overdue` or `subtle-foreground`).
- **States.** Rest; hover (`accent`); selected (`row-selected`, title in `row-selected-foreground`; neighbouring selected rows join into one block); keyboard focus (Nova's ring around the whole row); completed (struck through, `muted-foreground`, no priority); overdue (the flag status icon and `date-overdue`); subtask (indented under its parent).
- `task`: `{ title, status, key?, subtasks?, project?, projectColor?, event?, eventColor?, note?, priority, date?, dateTone?, selected? }`. Use it inside `TaskList`, which handles selection.
