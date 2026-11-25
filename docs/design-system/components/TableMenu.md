# TableMenu

The menu of a table's column or row in the note editor, opened from its `TableHandle`, 224px wide, under the label naming what it acts on ("Column · Endpoint", "Row 2", "Header row"):

- **A column**: its alignment as a segmented control of three icon buttons (Align left, center, right; the chosen one on the `segment-thumb`), which keeps the menu open; Sort A → Z and Z → A (0 → 9 and 9 → 0 when the column holds numbers); Insert left (⌘⌥←) and right (⌘⌥→); Move left (⌥⇧←) and right (⌥⇧→); Duplicate; Clear contents (the column keeps its name) and Delete column.
- **A row**: Insert above and below (⌘↵); Move up (⌥⇧↑) and down (⌥⇧↓); Duplicate; Clear contents and Delete row.
- **The header row**: Turn into a normal row, Insert below, Clear contents, Delete row.

A move that can't go further (the first column left, the first body row up) shows disabled. The shortcuts beside the items work with the caret in a cell. While Delete is pointed at or highlighted, the editor tints the cells it would remove red (`onPreviewChange`).

It offers only what a Markdown table keeps: an alignment belongs to the whole column, and there are no merged cells, colours or column widths (`docs/editor.md`).

**Base UI:** `Menu` inside DevBrain's `DropdownMenuContent` (`RadioGroup` and `RadioItem` for the alignment), in a controlled `DropdownMenu` anchored to the handle (`anchor`), since the handle drags too.
