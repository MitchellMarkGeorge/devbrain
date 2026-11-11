# NoteList

A virtualized list of `NoteRow`s: the Notes page's list view (Figma `7158:11693`) over every note in
a workspace. It is its own scroller: give it a height to fill (`flex: 1` in a column), and it draws
only the rows in view, about ten either side. Rows are `row-height` (48px), so the virtualizer's
estimate is exact.

`<NoteList ref={list} notes={notes} onOpen={open} onEndReached={fetchNextPage} />`, where `notes`
are core's `NoteListItem`s as they are (`NoteListRow`: a `NoteRow`'s fields and the `id`).

- **Paging.** `onEndReached` fires once the last drawn row comes within `endReachedThreshold` (20)
  of the end, once per length of the list: where a page calls `fetchNextPage()`.
- **Focus.** The focused row is kept as a note id, so it survives scrolling away; the list is one
  tab stop (the focused row, or the list while that row is out of view). It binds no keys but a
  row's Enter (`onOpen`) and X: the app's keymap moves focus and selects through its `ref`
  (`NoteListHandle`, a `ListKeyTarget` for `useListCommands`).
- **Selection**, as `TaskList`'s: each row's checkbox shows on hover and focus, and on every row
  while anything is selected; selected rows next to each other join into one block. X on the
  focused row toggles it. Controlled with `selected` and `onSelectedChange` (note ids), or not,
  with `defaultSelected`. The list draws no `SelectionBar`: the page puts one over its bottom
  with the actions notes have.
- **Menus.** Each row carries `data-note-id`, so a page's `ContextMenu` around the list finds the
  note a right-click was on.
- **Accessibility.** `role="grid"` with `aria-rowcount` (pass `rowCount` when a count knows the
  total) and `aria-rowindex` on each drawn row.
