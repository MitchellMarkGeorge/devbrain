# BoardColumn

An open status column on the board, as in the quiet direction: no panel, just a 24px header (the `StatusIcon`, the status name in 14px medium, and a ghost xs "+" button on the right) over its `BoardCard`s, 10px apart, and a dashed 40px "Add task" slot (`border-strong` dashes, 10px corners, a 16px "+" and the label in `muted-foreground`; `add: false` for Completed). Columns sit 24px apart and share the width equally (`Board`).

- `status` is a `TaskStatus`; the heading is its label ("In progress") unless `name` is given.
- The designed board shows no count in the header; `count` still adds one after the name when a page wants it.
- The header's "+" and the slot both call `onAdd`. Figma's `QuickAddRow` is the inline row a list group (or a column) can end with once "Add task" is clicked.
