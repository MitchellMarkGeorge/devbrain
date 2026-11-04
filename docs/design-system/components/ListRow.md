# ListRow

The strokeless 48px row that every list other than tasks shares with `TaskRow`, so Notes, Projects and Trash line up with the task list: 8px corners, the `row-selected` tint on hover and when selected, no line between rows.

- **Leading strip.** With `onSelect`, a selection checkbox sits in the 36px strip on the left and shows on hover, keyboard focus, while selected and on every row while anything is selected (`selecting`). `X` toggles the focused row, Enter opens it (`onOpen`).
- **Glyph and title.** `icon` sits in the 24px slot where a task row's status icon sits (36px from the edge), then the title in 14px `foreground-strong`, `titlePills` straight after it (a synced task's `SourcePill`), and an optional one-line `excerpt` in `muted-foreground` that is the first thing to shorten.
- **Right side.** `children` (pills), then `meta`: quiet 12px `subtle-foreground` text right-aligned in `metaWidth` (64px by default) so columns line up from row to row. `actions` (Restore, Delete) appear after the meta while the row is pointed at or focused.
- **States.** Rest, hover, selected (title in `row-selected-foreground`; `joinPrev`/`joinNext` join neighbours into one block), keyboard focus (the hover tint with a 1px `ring` outline), `muted` (dimmed title). `state` draws hover or focus for pictures.
- Built on it: `NoteRow`, `ProjectRow`, `TrashRow`.
