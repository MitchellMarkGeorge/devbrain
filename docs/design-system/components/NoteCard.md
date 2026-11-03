# NoteCard

A note as a card: a compact flat `Card` with the file icon and time, the title (14px medium) and a `subtle-foreground` preview. 16px padding and 8px between rows.

- **Home** (recent notes): no pill. Every card is 144px, so a row of cards lines up; the preview shows up to three lines and ends in "…", and a short note leaves space at the bottom.
- **Grids:** cards fill equal columns, never narrower than about 240px: three across in wide windows, two in compact ones (Home shows two and links to the rest).
- **Notes card view:** the card ends with the note's project or event pill (`link`). The preview drops to two lines and the card is 156px, the same for every card in the grid.
