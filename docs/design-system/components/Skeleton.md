# Skeleton

shadcn's Skeleton on `accent` (neutral-800 in dark, as shadcn), pulsing (still under reduced motion), so it shows on the page and on a `card`. Shapes: `block` for text bars (6px corners, as Figma's `Skeleton` symbol; the written spec's 8px is superseded), `icon` (a 16px icon's square, 4px), `circle` for pills, and `card` (the card's own fill and outline).

Match the shape of what loads. Ready-made stand-ins: `NoteCardSkeleton` (368×158: icon and edited, title, two excerpt lines, the pill) and `DetailSkeleton` (a task, project or note page's column: title, three description lines, a subtasks heading and four rows). Figma's `DetailSkeleton` also draws a Properties card at the right; detail pages no longer have one (README "Detail pages"), so it is left out. `TaskRowSkeleton` lives with the rows.

**Base UI:** No Base UI part: plain markup.
