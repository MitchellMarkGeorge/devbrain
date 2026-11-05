# NoteCard

A note as a card: a compact flat `Card` with the file icon and the time (12px `subtle-foreground`), the title (14px medium `foreground-strong`) and a `muted-foreground` preview (Figma; the earlier guide had a `subtle-foreground` preview). 16px padding and 8px between rows.

- **Notes card view:** the card ends with the note's project or event pill (`link`). The preview runs to two lines and the card is 156px, the same for every card in the grid. Without a link the preview runs to three lines and the card is 144px; a short note leaves space at the bottom.
- **Grids:** cards fill equal columns, never narrower than about 240px: three across in wide windows, two in compact ones.
- **`size="sm"`** (Figma's `NoteCardSmall`): Home's Recent notes, three in a `HomeCards` row 12px apart. 86px, 12px padding and 4px between rows: the icon and edit time, a one-line title and a one-line 12px preview, each ending in "…". No pill.
