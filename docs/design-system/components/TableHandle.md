# TableHandle

The controls on a table's edges in the note editor, drawn over the table by the editor (`TableControls`), which places them and wires what they do. Three parts:

- **`TableHandle`**: the grip on the edge of the column or row under the pointer (or the caret): 24×14 above the column, 14×24 left of the row, a `popover` pill with the `edge` outline, 6px corners and `shadow-md`, its 12px grip in `muted-foreground`, `accent` while pointed at. Clicking it selects the column or row and opens its `TableMenu`; dragging it moves the column or row, a 2px `swatch-blue` line showing where it lands. While its menu is open or it is dragged (`active`) it takes the selection's blue: a `swatch-blue` outline and icon over a 20% blue fill. The header row's handle opens its menu but doesn't drag: the header row stays first.
- **`TableInsertButton`**: a 16px round "+" on the line between two columns (above the table) or two rows (left of it), shown while the pointer is within 10px of that line in the handles' strip. Pointed at, it turns blue and the editor draws the line it inserts at; clicking inserts a column or row there. There is none above the header row.
- **`TableAddButton`**: the bar under the table (Add row, 10px, in the gap to the next block) and beside it (Add column, 14px), as long as the table: a `muted` fill with a 12px "+" in `subtle-foreground`, `accent` and `foreground` while pointed at. Shown while the pointer is over the table.

All three show only while the table can be edited, and say what they do in a tooltip and as their accessible name ("Column options", "Insert row", "Add column").

**Base UI:** none; plain buttons, the "+" buttons with DevBrain's `Tooltip`.
