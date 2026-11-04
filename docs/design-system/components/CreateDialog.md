# CreateDialog

The parts of the create dialogs: New task (and subtask), New project, New event. A `Dialog` without the × or a header, 600px wide (`size="task"`) or 480px (`size="event"`), hanging 140px from the top of the window so it doesn't jump as it grows.

- **Body** (`CreateDialogBody`): 20px from the top, 16px from the sides, its blocks 16px apart.
- **Title and description** (`CreateDialogFields`): the title is a borderless 24px semibold field ("Task title" in `subtle-foreground` while empty), the description a borderless 14px field under it ("Add description…", at least 40px, growing with its text), 6px apart.
- **Properties** (`CreateDialogProperties`): every property as a pill, 8px apart and wrapping: status, priority, due date (required; Create stays disabled until it is set), project, link ("Link to event or note"), then a quiet "…" on the right for the start date and "Add subtasks". A subtask's dialog leads with a "Subtask of" parent pill and drops project and link, which it takes from the parent.
- **Drafted tasks**: a `DraftTaskList` of subtasks (or a project's tasks).
- **Event fields** (`CreateDialogFieldList`, `CreateDialogField`): rows of a 16px `muted-foreground` icon and the value, 10px apart and at least 32px tall, 8px between rows: when (date, start → end, "All day" switch on the right), repeat, calendar (its colour bar), location and meeting link (inputs), description (a textarea, the icon on its first line).
- **Footer** (`CreateDialogFooter`): a `muted` band over a `border-strong` line, 16px padding: "Create more" (a switch that keeps the dialog open after ⌘↵) on the left for tasks, then a `ghost` Cancel and the `default` Create button.

**Base UI:** `Dialog` through DevBrain's `DialogContent`; `Switch` for Create more.
