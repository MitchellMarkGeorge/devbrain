# HomeSection

Home's section (README "Home"): Home shows one, the top-ranked.

- **Header (26px):** the title as a menu label (12px `muted-foreground`: "Meetings", "Tasks", "Recent notes", "Recent projects", "Get started"), 10px above the first row, and optionally a 12px `muted-foreground` link with an arrow at the right ("All 6 tasks →", "Calendar →", "All notes →", "All projects →") that lifts to `foreground` on hover. "Get started" has no link.
- **Rows:** at most three: `HomeRow`s for meetings and projects, `TaskRow compact` for tasks (44px, with all their pills), or `SetupRow`s; or, for Recent notes, `HomeCards`: three small `NoteCard`s (`size="sm"`) in equal columns 12px apart.
- **More:** `more` adds a 32px line under the rows for what didn't fit ("3 more tasks today", "1 more meeting today"), 12px `muted-foreground`, 42px in, lined up with a `HomeRow`'s title.

**Base UI:** No Base UI part: a `section` with a heading and a link or button.
