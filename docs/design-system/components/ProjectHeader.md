# ProjectHeader

The top of a project's overview: the name (24px semibold `foreground-strong`, Figma's document-title), 12px above a wrapping row of property pills 6px apart: status (`EntityPill` with `ProjectStatusIcon`), dates (`DateRange`, start → due), progress (`ProgressRing` and "25% · 3 of 12 done", hidden with no tasks) and "+ Add"; then 24px below, the description in 14px `foreground` paragraphs 12px apart. The task groups follow 24px further down.

- Props: `title`, `status`, `statusPill`, `start`, `due`, `done`, `total`, `onAddProperty`, `description`.

**Base UI:** No Base UI part: plain markup.
