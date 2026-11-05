# TaskNoteCard

A task's note, under its subtasks on the task page and in the task sheet: a flat `card` (`edge` outline, 10px corners, 12px × 16px padding, 12px gaps) laid out like a task row.

- **Row.** The 16px `muted-foreground` file icon, the note title in 14px medium `foreground-strong` (cut with "…", the full title in its tooltip), then on the right pills for the note's `project` (`EntityPill type="project"` in the project's colour) and `tasksSummary`, then the edit time (`updated`: "2h ago", "Jul 1") in 12px tabular `subtle-foreground`. The summary is a plain `EntityPill` with the `circle-check` icon ("2 tasks · 1 in progress"), the same pill the note editor shows under its title. `pills` adds more after them; the pills wrap 6px apart.
- **Opening.** The title is a button whose click area covers the whole card: clicking anywhere but the pills calls `onOpen`. The pills sit above it, so they stay clickable.
- **Layout.** `row` keeps one line; `stacked` puts the pills on a second line under the title (4px below it), with the icon and time centred on both lines, for a narrow side sheet; `auto` (the default) stacks when the card is narrower than 440px.
- **States.** Hover fills it with `accent` (`duration-fast`); keyboard focus on the title rings the whole card (`ring` border and 3px halo).

Without a note, the page shows an `AddSlot` ("Add a task note") in its place.

**Base UI:** No Base UI part: a `div` holding a `button` and `EntityPill`s.
