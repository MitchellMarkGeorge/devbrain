# HomeRow

Figma's `FocusMeetingRow` and `ProjectRecentRow`: Home's minimal row for meetings and recent projects. Lighter than the lists' rows: 36px, 16px in at the sides, no selection strip and no checkbox, 8px corners, 10px between parts.

- **Glyph:** 16px (`icon`): the calendar's `ColourBar` for a meeting, a project's folder in its colour.
- **Title:** 14px `foreground-strong`, one line ending in "…".
- **Its own parts** (`children`), then **`meta`** at the right: 12px `muted-foreground`, right-aligned in 72px; `metaTone="today"` or `"overdue"` colours it.
  - **Meeting:** an xs default "Join" (video icon) from 5 minutes before the start until the end, then when: "In 12 min" (`metaTone="today"`), "Now", "10:30", "Tue 9:30". The next or current meeting is `current` (filled with `card`); finished meetings drop off; tomorrow's first meeting is `muted` (title and glyph at 50%).
  - **Project:** a 96px `Progress` bar, "3/12" as a 36px `HomeRowNote`, then the due date ("Due Jul 1") or the status ("On hold").
- Hover takes `row-selected`; with `onOpen` the row takes focus (a 1px `ring` outline) and Enter or a click opens it.

**Base UI:** No Base UI part: plain markup.
