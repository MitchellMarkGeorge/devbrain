# ProjectHeader

The top of a project's overview, laid out as a document's top (the task and note pages'): an optional tile, then the name, 12px above a wrapping row of property pills 6px apart, then 24px below, the description.

- **Name**: an `EditorTitle` at `size="lg"` (30px semibold `foreground-strong`, tightened 1%): larger than a task's or note's 24px title, as a project heads the work under it. The page passes its own editable `EditorTitle` through `title`, saving the name as the task and note pages save theirs; without one the header draws the plain title.
- **Pills**: status (`EntityPill` with `ProjectStatusIcon`, or the page's `statusPill`), dates (`DateRange`, start → due), then `meta`, quiet 12px `muted-foreground` text 6px further on: how long is left ("6 days left", "Done Nov 12"; the page colours an overdue one `date-overdue`).
- **Description**: 14px `foreground` paragraphs 12px apart, or the page's `RichTextEditor`.
- **Tile** (`icon`): 16px above the name. The project page draws a 40px tile with the folder in the project's colour on a 14% tint of it, which opens Change colour.
- Props: `project`, core's `Project` as it is (`ProjectHeaderData`: `title`, `status`, `startDate`, `dueDate`); `icon`; `title`; `statusPill`; `duePicker` and `startPicker` (each a `DatePicker`, with its Clear, passed to the `DateRange` so each pill opens its picker); `meta`; `description`.
- Dates are formatted with `useFormat()`'s `formatDate` ("Jun 1 → Jul 1"); with no start, the due date and "+ Start date"; no dates pill without a due date, unless there is a `duePicker`, when it reads "Due date". While the project is open the due glyph is coloured `date-today` when it is due today and `date-overdue` once the date has passed.
- Progress is not in the header: the overview's Progress section shows it.

- Stories: `Default`, `NewProject`, `Overdue`, `Editable`.

**Base UI:** No Base UI part: plain markup (the pickers' `Popover` comes from `DateRange`).
