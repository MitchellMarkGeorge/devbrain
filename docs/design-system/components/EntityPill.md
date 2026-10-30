# EntityPill

The chip every relation uses: in task rows, in the properties card and on document headers. It opens the linked item on click: `project` (folder icon in the project's colour), `note` (file icon), `task` (in-progress activity icon), `event` (a bar in the calendar's colour, label in `foreground`).

- A chip with its own fill (`neutral-900` at 55% over the ground) and a faint edge (`foreground` at 9%), so it stays a recessed chip on a hovered or selected row. Pointing at it lifts it a little: a slightly lighter fill, a slightly stronger edge, and the label from `muted-foreground` to `foreground`. Light theme: a white chip.
- `color` sets a project's icon or an event's bar to one of the six `swatch-*` colours; a project with no colour keeps a grey icon. Other labels sit in `muted-foreground`; `prefix="Linked to"` on document headers.
