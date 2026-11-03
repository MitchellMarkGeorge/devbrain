# TaskRow

One task in a strokeless list: no line beneath, a `row-height` (48px) row with 8px corners that takes the `row-selected` tint on hover and when selected.

- **Leading control.** The status icon is a button: click it (or press `S` on a focused row) for the `StatusMenu`, then `1`, `2` or `3`. The selection checkbox sits in a strip to its left and shows on hover, on keyboard focus, and on every row while any row is selected (`X` toggles the focused row).
- **Title first.** The name in 14px `foreground-strong`, then pills:
  - a synced task's `SourcePill`: the provider's logo and the key ("[Linear] ENG-124"), so where the task comes from and its key read as one unit;
  - on a subtask, its parent (`EntityPill type="parent"`: corner arrow, status icon, parent title), left off in a task page's own Subtasks list, where the parent is the page;
  - on a parent task, the subtask count in a pill (`ProgressRing` and "3/4").
- **When the row runs out of room,** the pills on each side stack like a deck (the last in full, the others showing their edge and icon) and spread out on hover or focus; the row keeps its height. The title shortens only after that.
- **Right side.** `EntityPill` chips (the project, its folder icon in `projectColor`, then the linked event or note), `PriorityIcon`, and the date (`date-today`, `date-overdue` or `subtle-foreground`).
- **States.** Rest; hover (`row-selected`, the same tint as selected); selected (`row-selected`, title in `row-selected-foreground`; neighbouring selected rows join into one block); keyboard focus (Nova's ring around the whole row); completed (struck through, `muted-foreground`, no priority); overdue (the flag status icon and `date-overdue`); subtask (indented under its parent).
- `task`: `{ title, status, key?, source?, parent?, subtasks?, project?, projectColor?, event?, eventColor?, note?, priority, date?, dateTone?, selected? }`. Use it inside `TaskList`, which handles selection.
