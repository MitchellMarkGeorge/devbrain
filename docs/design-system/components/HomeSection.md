# HomeSection

One of Home's sections (README "Home"). Home shows at most two, 32px apart (`group-gap`).

- **Header (26px):** the title as a menu label (12px `muted-foreground`: "Meetings", "Tasks", "Recent notes", "Recent projects", "Get started"), 10px above the first row, and optionally a 12px `muted-foreground` link with an arrow at the right ("All 6 tasks →", "Calendar →", "All notes →", "All projects →") that lifts to `foreground` on hover. "Get started" has no link.
- **Rows:** at most three: `EventRow`s for meetings, `TaskRow`s (unchanged, with all their pills), `NoteRow`s or `ProjectRow compact`, or `SetupRow`s; or, for Recent notes as the first section, `HomeCards`: three small `NoteCard`s (`size="sm"`) in equal columns 12px apart.
- **More:** `more` adds a 32px line under the rows for what didn't fit ("3 more tasks today", "1 more meeting today"), 12px `muted-foreground`, lined up with the rows' titles.

**Base UI:** No Base UI part: a `section` with a heading and a link or button.
