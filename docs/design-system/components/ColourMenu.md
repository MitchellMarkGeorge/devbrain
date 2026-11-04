# ColourMenu

The colours for a selection, 4px under the `FormatToolbar`'s colour button, 256px: a "Text" row and a "Highlight" row of ten `ColourSwatch`es each, 4px apart: the default, gray, light gray and dark gray, then the six swatches. Text colours use `swatch-*` (and `muted-foreground`, `subtle-foreground`, `neutral-600` for the grays); highlights use `swatch-*-tile` (and `muted`, `accent`, `neutral-700`). Each swatch names itself in a tooltip; the current ones have the ring.

**ColourSwatch** is 20px with 6px corners and a `border-strong` outline: `kind="text"` shows an "A" in the colour, `kind="highlight"` a tile filled with it. The current one has a 2px `foreground` ring.

**Base UI:** `Menu` (`RadioGroup`, `RadioItem`) inside DevBrain's `DropdownMenuContent`; `Tooltip`.
