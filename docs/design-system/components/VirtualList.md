# VirtualList

A long list of rows: the Projects list over all of a workspace's projects, drawing only the rows in view. It takes `items`, `renderItem(item, index)` (a `ListRow`, or a row built on it such as `ProjectRow`) and `getKey(item)`. `TaskList` and `BoardColumn` virtualize themselves; this is for the other lists of rows.

- **Its own scroller.** It fills the height its container gives it (placed straight in a `PageContent layout="list"`) and scrolls under the page header and toolbar, which stay put, in a `ScrollArea` (the scrollbar drawn over its edge, taking no width).
- **Virtualized** (`@tanstack/react-virtual`): rows are `row-height` (48px) before they are measured (`estimateRowHeight`), and each is measured as it draws. The rows flow in order, not positioned, padded at the top by the space the rows above them would take.
- **Loading more.** `onEndReached` fires near the last loaded rows (`endReachedThreshold`, 20 rows).
- **Accessibility.** `role="grid"` (named with `aria-label`) with `aria-rowcount` (from `itemCount` when a count gives the total); each item draws its own `row`.
- Story: `1,000 rows`.

**Base UI:** No Base UI part: plain markup.
