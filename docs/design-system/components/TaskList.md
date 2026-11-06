# TaskList

A list of `TaskRow`s that handles selection: rows selected next to each other join into one block, every row shows its checkbox while anything is selected, and the `SelectionBar` floats over the bottom of the list.

- `tasks` (core's `TaskListItem`s as they are, `TaskRowData[]`), `selected` / `defaultSelected` / `onSelectedChange` (the selected tasks' `id`s, a `string[]`), `states` (`{index: 'hover' | 'focus'}` for static pictures), `menuOpenAt` (a row with its status menu open), `subtasks` (indent every row), `selectionBar: false` to leave the bar to the page.
- Keyboard: ↑/↓ move between rows, `X` selects, `S` opens the status menu; in the app Enter opens the task.
