# ProjectList

A virtualized list of `ProjectRow`s: the Projects page's list view (Figma `7158:15157`) over every
project in a workspace, as `NoteList` is the Notes page's. It is its own scroller: give it a
height to fill (`flex: 1` in a column), and it draws only the rows in view, about ten either side.
Rows are `row-height` (48px), so the virtualizer's estimate is exact.

`<ProjectList ref={list} projects={projects} onOpen={open} onEndReached={fetchNextPage} />`, where
`projects` are core's `ProjectListItem`s as they are (`ProjectListRow`: a `ProjectRow`'s fields, the
`id`, and the `stats` its progress bar reads).

- **Paging.** `onEndReached` fires once the last drawn row comes within `endReachedThreshold` (20)
  of the end, once per length of the list: where a page calls `fetchNextPage()`.
- **Focus.** The focused row is kept as a project id, so it survives scrolling away; the list is
  one tab stop (the focused row, or the list while that row is out of view). It binds no keys but
  a row's Enter (`onOpen`) and X: the app's keymap moves focus and selects through its `ref`
  (`ProjectListHandle`, a `ListKeyTarget` for `useListCommands`), with `TaskList`'s Vim parts: `pageSize()`,
  `itemsFromFocus(n)` and a range (`startRange()`/`endRange()`) that moving focus grows. As in `TaskList`, focus follows
  the focused row when it goes (moved to trash), to the row that takes its place.
- **Selection**, as `TaskList`'s: each row's checkbox shows on hover and focus, and on every row
  while anything is selected; selected rows next to each other join into one block. X on the
  focused row toggles it. Controlled with `selected` and `onSelectedChange` (project ids), or not,
  with `defaultSelected`. The list draws no `SelectionBar`: the page puts one over its bottom with
  the actions projects have.
- **Menus.** Each row carries `data-project-id`, so a page's `ContextMenu` around the list finds
  the project a right-click was on.
- **Accessibility.** `role="grid"` with `aria-rowcount` (pass `rowCount` when a count knows the
  total) and `aria-rowindex` on each drawn row.
- Stories: `Default`, `Selected`, `Long` (1,000 rows).

**Base UI:** No Base UI part: plain markup in a `ScrollArea`.
