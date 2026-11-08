# CardGrid

Cards in equal columns: the Notes and Projects card views (16px apart, `gap="md"`; `gap="sm"` is 12px). Three columns by default; in compact windows (inside a `WorkspaceShell`) two (README "Window sizes"). Home's row of small note cards is `HomeCards` (see `HomeSection`).

- **Virtualized** when given `items`, `renderItem(item, index)` and `getKey(item)`: the grid is its own scroller, filling the height its container gives it and scrolling under the page header, and each row of cards is one virtual row (`@tanstack/react-virtual`), measured as it draws (`estimateRowHeight`, 172 for a Notes card row by default), so a workspace with thousands of notes draws a few rows. The column count comes from the window size as above, and a virtual row holds that many cards. `onEndReached` fires near the last loaded rows (`endReachedThreshold`, 7 rows). `role="grid"` with `aria-rowcount` (rows of cards, from `itemCount` when a count gives the total) and `aria-rowindex` on each row. The story `1,000 cards` shows it.
- With `children` it draws them as they are: a loading state, a handful of cards.

**Base UI:** No Base UI part: a CSS grid.
