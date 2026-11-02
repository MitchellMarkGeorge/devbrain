# GroupHeading

A group in the grouped list. No band and no line: `group-gap` (32px) of space above it, a chevron, a 32px tile (the group's icon in its colour, or an event's colour bar), the title (14px medium) over a subtitle (12px `muted-foreground`), an xs "Add task" button, the done/total count and an 80px progress bar.

- Group by due date ("Overdue · Oldest due Sep 28"), by what tasks link to ("Mitchell / Jesse 1:1 · Event · Today 10:00 AM") or by project. `collapsed` hides the Add button and points the chevron right.

## Tile

The tile is a tint of the group's own colour, not a solid block: its fill is the same colour as the icon (the project's swatch, or the status colour) at **15% opacity**, with the icon on top at full strength. In CSS, `background: color-mix(in oklab, var(--swatch-blue) 15%, transparent)`, or the status token for a status group (`--status-in-progress`, `--status-completed`, `--status-overdue`). Not started and cancelled groups keep the neutral `secondary` tile.

The Figma screens use the solid `swatch-*-tile` tokens (the 900 steps) as a stand-in, because Figma drops a paint's opacity when it re-resolves a bound colour variable. Build from this note, not from the Figma fill.
