# QuickAddRow

The inline "Add task…" row that ends a list group (or a board column), on a task row's 48px anatomy.

- **Placeholder.** A 16px "+" in the status slot and "Add task…" in `subtle-foreground`. Clicking it puts the caret in the row.
- **Typing.** The row takes the focused-row look (the `row-selected` tint and a 1px `ring` outline), the "+" becomes the not-started status icon, and on the right show the pills the new task inherits from its group (`children`: its project, event or note), its default priority and due date ("Today" in `date-today`), and a `Kbd` "↵".
- ↵ creates the task (`onCreate(title)`), clears the row and keeps it open for the next one; Esc clears it and leaves.

`state="typing"` draws the typing look without focus, for pictures.
