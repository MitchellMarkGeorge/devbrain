# ProjectCard

A project in the Projects cards view: a `Card` (16px padding, 12px between rows) with the folder in the project's colour, the name (14px medium `foreground-strong`) and the due date (12px `subtle-foreground`) on the right; the percent (12px `foreground`) over "3 of 12 tasks done" (12px `muted-foreground`) and one 4px `Progress` bar, 6px below; then the status pill (`EntityPill` with the 12px `ProjectStatusIcon`). Progress is always shown this one way; health is not shown for now. Hover strengthens the outline to `border-strong`.

- Props: `project`, core's `Project` as it is (`ProjectCardData`: `title`, `color`, `status`, `dueDate`, `completedAt`); `stats`, its `ProjectStats` (the `stats` each `projects.list` item carries) (`numOfCompleted`, `totalTasks`; 0 of 0 without them); `statusPill` (a StatusMenu trigger in place of the plain pill); `render`.
- The folder takes the project's colour through `resolveColor` (a swatch name or a `#rrggbb`; blue without one). The date is derived: "Done Jun 12" once the project is `ProjectStatus.COMPLETED`, else "Due Jul 1" / "Due tomorrow" (`dueText`), else none. The percent is done of total, rounded, 0 with no tasks.
- Grid: columns of at least 300px, 16px apart (three across at 1440px).

**Base UI:** No Base UI part: `useRender`, so `render={<a href=… />}` makes the card a link.
