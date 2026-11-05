# NoteRow

A note in the Notes list, on the shared 48px `ListRow`: the file-text icon, the title, a one-line excerpt in `muted-foreground` (it shortens first), the pills of what the note links to (`EntityPill`s for a task, event or project, as `children`) and when it was edited ("2h ago", "Yesterday", "Jun 19") right-aligned in 64px. The checkbox shows on hover.

`<NoteRow title excerpt edited onSelect onOpen>{pills}</NoteRow>`
