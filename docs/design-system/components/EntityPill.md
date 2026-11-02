# EntityPill

The chip every relation uses: in task rows, in the `PropertyRow` lines on task and project pages, and on note headers. It opens the linked item on click: `project` (folder icon in the project's colour), `note` (file icon), `task` (its status icon), `parent` (a subtask's parent: a `muted-foreground` corner arrow, then its status icon), `event` (a bar in the calendar's colour).

- shadcn's outline badge: no fill and a `border` outline (translucent in dark), so the outline stays visible on the page, on a `card` and on a hovered or selected row. Pointing at it fills it with `pill-fill-hover` (`accent` at 60%), strengthens the outline to `pill-edge-hover` (`foreground` at 13%) and lifts the label from `muted-foreground` to `foreground`. At rest every label stays muted. The same rule in both themes.
- `color` sets a project's icon or an event's bar to one of the six `swatch-*` colours; a project with no colour keeps a grey icon. Every label sits in `muted-foreground`, events included: the icon or bar says what the link is, so no kind of link outweighs another in a row. Detail pages drop prefixes ("Linked to", "Subtask of"): the icon says what the link is.
