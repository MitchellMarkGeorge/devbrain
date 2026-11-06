# NoteRow

A note in the Notes list, on the shared 48px `ListRow`: the file-text icon, the title, its `preview` cut to one line in `muted-foreground` (it shortens first), the pills of what the note links to (its `link`, a task or an event, then its `project`, as `EntityPill`s) and when it was edited (`formatRelative`: "2 hr. ago", "3 days ago") right-aligned in 64px. The checkbox shows on hover.

`<NoteRow note={note} onSelect onOpen />`, where `note` is core's `NoteListItem` as it is (`NoteRowData`: `title`, `preview`, `updatedAt`, `project`, `link`).
