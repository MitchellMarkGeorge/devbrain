# NoteRow

A note in the Notes list, on the shared 48px `ListRow`: the file-text icon, the title, a one-line excerpt in `muted-foreground` (it shortens first), the pills of what the note links to (`EntityPill`s for a task, event or project, as `children`) and when it was edited ("2h ago", "Yesterday", "Jun 19") right-aligned in 64px. The checkbox shows on hover.

- **Home's Recent notes** (when it is Home's second section): no excerpt and no pills. `context` says what the note belongs to as quiet 12px `subtle-foreground` text ("Auth Overhaul", "Meeting note"), then the edit time. No `onSelect`, so no checkbox. When Recent notes is Home's first section it shows small `NoteCard`s instead.

`<NoteRow title excerpt edited context onSelect onOpen>{pills}</NoteRow>`
