# TableToolbar

The two bars of a table in the note editor, drawn as the `FormatToolbar`'s `popover` strip (the `edge` outline, 10px corners, `shadow-md`, 28px buttons). The editor positions them; they draw.

**`TableToolbar`**, over the table's top right corner while you work in it (pointed at, or the caret in it), its bottom edge above the column handles:

- **Header row**, a text button (13px medium) with a 22×12 switch: on (the track in `primary`, the thumb right) while the first row is the header. Turning it off keeps the row as a normal one; a Markdown table without a header is written with an empty one.
- the size, columns × rows ("4 × 5"), in 12px mono `subtle-foreground`;
- **Copy as Markdown** and **Delete table**. Delete table turns red while pointed at, and the editor tints every cell red with it.

It hides while text is selected, when the format toolbar is up.

**`TableCellToolbar`**, over a block of cells selected by dragging (under it when the block starts at the first row): its size, the alignment of its columns as three toggles (Markdown keeps one a column, so they align the whole columns; none is pressed while the columns differ), Clear (⌫), then **Delete rows** and **Delete columns** as text buttons that turn red while pointed at, the cells they would remove tinted red with them.

**Base UI:** `Toolbar` (`Root`, `Button`, `Separator`) with `Toggle` for Header row and the alignments.
