# TableSizePicker

The size of a new table, beside the slash menu while its Table item is highlighted: a menu surface holding a grid of 18px squares, 8 columns by 6 rows, 3px apart, with 4px corners and a `border-strong` outline. The squares up to the size highlighted are tinted with `swatch-blue-tint` and a blue outline, the first row (the header row) stronger. Under the grid, the size in 13px medium ("4 columns · 3 rows") and a 12px `muted-foreground` hint.

Pointing at a square highlights the size it ends; clicking inserts it. From the keyboard, → on Table moves the arrow keys into the grid (it shows a ring, and the hint reads "↵ inserts it"): ←, →, ↑ and ↓ change the size, ← past one column gives the keys back to the list, and ↵ inserts it. ↵ on Table itself inserts the default, 3 × 3. A table grows past the grid's 8 × 6 afterwards.

**Base UI:** none (the caret stays in the editor, which passes the keys on, as with the `SlashMenu`).
