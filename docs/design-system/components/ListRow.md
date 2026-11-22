# ListRow

The strokeless 48px row that every list other than tasks shares with `TaskRow`, so Notes, Projects and Trash line up with the task list: 8px corners, the `row-selected` tint on hover and when selected, no line between rows.

- **Leading strip.** A grid of named areas as TaskRow's (`check`, `icon`, `main`, `side`), each part optional. With `onSelect`, a selection checkbox sits in the 32px strip on the left, 8px from the edge, and shows on hover, keyboard focus, while selected and on every row while anything is selected (`selecting`). `X` toggles the focused row, Enter opens it (`onOpen`).
- **Glyph and title.** `icon` sits in the 24px slot where a task row's status icon sits (32px from the edge), then the title in 14px `foreground-strong`, `titlePills` straight after it (a synced task's `SourcePill`), and an optional one-line `excerpt` in `muted-foreground` that is the first thing to shorten.
- **Right side.** `children` (pills), then `meta`: quiet 12px `subtle-foreground` text right-aligned in `metaWidth` (60px by default, the width of a task row's date) so columns line up from row to row, and dates sit in the same width in every list. `actions` (Restore, Delete) appear after the meta while the row is pointed at or focused.
- **States.** Rest, hover, selected (title in `row-selected-foreground`; `joinPrev`/`joinNext` join neighbours into one block), keyboard focus (the hover tint with a 1px `ring` outline), `muted` (dimmed title). `state` draws hover or focus for pictures.
- Built on it: `NoteRow`, `ProjectRow`, `TrashRow`.
