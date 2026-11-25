# MentionRow

One item that mentions another, in "Mentioned in": a note, or a task's, project's or event's description, that links to it (`devbrain://` links, drawn as pills in the editor). The compact row of `LinkedTaskRow`: 36px, 8px in from the sides, 8px corners, a grid of named areas (`glyph`, `title`, `time`, 8px apart).

- **Glyph**, in a 20px slot in `muted-foreground`: a task's `StatusIcon` (14px), a project's folder in its colour, an event's `ColourBar` in its colour (green when it has none), a note's file, or, for an event's note (`linkedEventId`), the calendar, as it is the meeting's.
- **Title** in 14px `foreground`, cut to one line ("Untitled" when the source has none).
- **When the source changed**, right-aligned in 12px `subtle-foreground`: `formatRelative` within a week ("2h ago", "Yesterday"), then `formatDate` ("Jun 18").
- **No preview text**: the row names the source, it doesn't quote it.
- Hover and keyboard focus fill it with `row-selected`; a click or Enter opens the source (`onOpen`). `state` draws hover or focus for pictures.

`mention`: core's `Mention` as `mentions.list` returns it (`source`, `updatedAt`). The row carries `data-source-id`.

- Stories: `Default`, `Hover`, `Focus`, `Sources`.

**Base UI:** No Base UI part: plain markup.
