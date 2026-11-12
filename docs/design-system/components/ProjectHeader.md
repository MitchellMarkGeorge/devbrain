# ProjectHeader

The top of a project's overview: the name (30px semibold `foreground-strong`, tightened 1%: larger than a task's or note's 24px title, as the project page is wider and its title heads two columns), 12px above a wrapping row of property pills 6px apart: status (`EntityPill` with `ProjectStatusIcon`), dates (`DateRange`, start → due), progress (`ProgressRing` and "25% · 3 of 12 done", hidden with no tasks) and "+ Add"; then 24px below, the description in 14px `foreground` paragraphs 12px apart. The task groups follow 24px further down.

- Props: `project`, core's `Project` as it is (`ProjectHeaderData`: `title`, `status`, `startDate`, `dueDate`); `stats`, its `ProjectStats` (`numOfCompleted`, `totalTasks`, from the list's `stats` or `projects.stats`); `statusPill`; `onAddProperty`; `description`, a slot for the description (the project page puts its `RichTextEditor` there); `onTitleChange`; `duePicker` and `startPicker`.
- **Editing.** With `onTitleChange` the name edits in place, with no ring: Enter or leaving it saves a changed, non-empty name, and Escape (or an empty name) puts it back. `duePicker` and `startPicker` (each a `DatePicker`, with its Clear) are passed to the `DateRange`, so each pill opens its picker.
- Dates are formatted with `useFormat()`'s `formatDate` ("Jun 1 → Jul 1"); with no start, the due date and "+ Start date"; no dates pill without a due date, unless there is a `duePicker`, when it reads "Due date". While the project is open the due glyph is coloured `date-today` when it is due today and `date-overdue` once the date has passed.

- Stories: `Default`, `NewProject`, `Overdue`, `Editable`.

**Base UI:** No Base UI part: plain markup (the pickers' `Popover` comes from `DateRange`).
