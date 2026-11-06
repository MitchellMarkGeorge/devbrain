# ProjectHeader

The top of a project's overview: the name (24px semibold `foreground-strong`, Figma's document-title), 12px above a wrapping row of property pills 6px apart: status (`EntityPill` with `ProjectStatusIcon`), dates (`DateRange`, start → due), progress (`ProgressRing` and "25% · 3 of 12 done", hidden with no tasks) and "+ Add"; then 24px below, the description in 14px `foreground` paragraphs 12px apart. The task groups follow 24px further down.

- Props: `project`, core's `Project` as it is (`ProjectHeaderData`: `title`, `status`, `startDate`, `dueDate`); `stats`, its `ProjectStats` (`numOfCompleted`, `totalTasks`); `statusPill`; `onAddProperty`; `description`, a slot for the description already rendered from its markdown.
- Dates are formatted with `useFormat()`'s `formatDate` ("Jun 1 → Jul 1"); with no start, the due date and "+ Start date"; no dates pill without a due date. While the project is open the due glyph is coloured `date-today` when it is due today and `date-overdue` once the date has passed.

**Base UI:** No Base UI part: plain markup.
