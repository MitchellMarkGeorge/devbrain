# EntityPill

The chip every relation uses: in task rows, in the properties card and on document headers. It opens the linked item on click: `project` (folder icon in the project's colour), `note` (file icon), `task` (in-progress activity icon), `event` (a bar in the calendar's colour, label in `foreground`).

- shadcn's outline badge: no fill and a `border` outline (translucent in dark), so the outline stays visible on the page, on a `card` and on a hovered or selected row. Pointing at it tints it with `accent` at 60%, with a slightly stronger edge and the label from `muted-foreground` to `foreground`. The same rule in both themes.
- `color` sets a project's icon or an event's bar to one of the six `swatch-*` colours; a project with no colour keeps a grey icon. Other labels sit in `muted-foreground`; `prefix="Linked to"` on document headers.
