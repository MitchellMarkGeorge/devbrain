# GroupHeading

A group in the grouped list. No band and no line: `group-gap` (32px) of space above it, a chevron, a 32px tile (the group's icon in its colour, or an event's colour bar), the title (14px medium) over a subtitle (12px `muted-foreground`), an xs "Add task" button, the done/total count and an 80px progress bar.

- Group by due date ("Overdue · Oldest due Sep 28"), by what tasks link to ("Mitchell / Jesse 1:1 · Event · Today 10:00 AM") or by project. `collapsed` hides the Add button and points the chevron right.

## Tile

The tile is a tint of the group's own colour, not a solid block: the group's colour at 15% behind the icon at full strength. Projects use `swatch-*-tint`; status groups use `status-in-progress-tint`, `status-completed-tint` and `status-overdue-tint` (lighter in light mode, as the status colours are). Not started and cancelled groups keep the neutral `secondary` tile. The tints carry their alpha in the token, so Figma keeps them (a paint's own opacity is dropped when Figma re-resolves a bound variable).
