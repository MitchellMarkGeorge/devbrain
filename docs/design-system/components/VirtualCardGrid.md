# VirtualCardGrid

A long `CardGrid`: the Notes and Projects card views over all of a workspace's notes or projects, drawing only the rows of cards in view. It takes `items`, `renderItem(item, index)` and `getKey(item)`, and the same `columns` and `gap` as `CardGrid`.

- **Its own scroller.** It fills the height its container gives it (placed straight in a `PageContent layout="grid"`) and scrolls under the page header and toolbar, which stay put.
- **Virtualized by rows of cards** (`@tanstack/react-virtual`): each row is a `CardGrid` of that many cards, one virtual row, measured as it draws (`estimateRowHeight`, 172 for a Notes card row by default), so a workspace with thousands of notes draws a few rows. The column count comes from the window size, as for `CardGrid`: three by default, two in compact windows. The rows flow in order, not positioned, padded at the top by the space the rows above them would take.
- **Loading more.** `onEndReached` fires near the last loaded rows (`endReachedThreshold`, 7 rows).
- **Accessibility.** `role="grid"` (named with `aria-label`) with `aria-rowcount` (rows of cards, from `itemCount` when a count gives the total) and `aria-colcount`; each row is a `row` with `aria-rowindex`, each card a `gridcell`.
- Story: `1,000 cards`.

**Base UI:** No Base UI part: a CSS grid per row.
