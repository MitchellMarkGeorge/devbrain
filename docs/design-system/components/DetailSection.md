# DetailSection

A titled block of a sheet or a detail page: Subtasks, Task note, Linked tasks, Event note, Mentioned in.

- **Heading**: 28px, the title in 14px medium `foreground`, then an optional 12px glyph (the subtasks' `ProgressRing`) and count in 12px `muted-foreground` ("3/4", "2"), 6px apart, and actions on the right (an xs "Add" button; "Link Task" and "New Task").
- **Content** sits 4px under the heading in a sheet and 8px on a page (`spacing="page"`).
- **`collapsible`**: a chevron before the title folds the content away (a sheet's Mentioned in, folded until opened); the chevron turns to point right while closed.

**Base UI:** `Collapsible` (`Root`, `Trigger`, `Panel`) when collapsible; otherwise a `section` named by its heading.
