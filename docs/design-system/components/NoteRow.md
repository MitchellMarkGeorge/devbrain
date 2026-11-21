# NoteRow

A note in the Notes list, on the shared 48px `ListRow`: the file-text icon, the title ("Untitled" when it has none), its `preview` cut to one line in `muted-foreground` (it shortens first), the pills of what the note links to (its `link`, a task or an event, then its `project`, as `EntityPill`s) and the day it was last edited, always the date ("Nov 20"; "Dec 2025" in another year, from `formatListDate`), right-aligned in 64px so the dates line up down the list. The checkbox shows on hover. Its pills open their `EntityHoverCard` after about 400ms of pointing, from the `PillHoverCardsProvider` around the page.

`<NoteRow note={note} onSelect onOpen />`, where `note` is core's `NoteListItem` as it is (`NoteRowData`: `title`, `preview`, `updatedAt`, `project`, `link`).
