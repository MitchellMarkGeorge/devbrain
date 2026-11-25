# MentionsSection

What mentions an item, the two ways it is shown: **`MentionsSection`** in a sheet (task, note and event sheets) and **`MentionsPill`** on a page (the task page's links line, the note page's header, the project's header). Both take core's `Mention[]` as `mentions.list` returns it and `onOpen(mention)`, and draw a `MentionList`.

- **`MentionsSection`**: a collapsible `DetailSection` titled "Mentioned in", with the count as a secondary `Badge`, folded to its heading line until opened (`defaultOpen` opens it), so a sheet stays short. It sits last in the sheet. Rows: the first 5, then "Show n more" (`limit`).
- **`MentionsPill`**: a `PillPopover` with the `AtSign` glyph and "7 mentions" ("1 mention", `mentionsLabel`), opening "Mentioned in" with every row, scrolling past 360px.
- The app leaves both out while nothing mentions the item.
- A row opens its source where it lives: a task's, project's or note's page, an event in the calendar on its day.

- Stories: `Folded`, `Open`, `Empty`, `Pill`.

**Base UI:** `Collapsible` through `DetailSection`; `Popover` through `PillPopover`.
