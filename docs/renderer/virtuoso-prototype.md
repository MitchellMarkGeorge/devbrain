# TaskList on react-virtuoso: a prototype

An experiment to decide whether the virtualized lists move from `@tanstack/react-virtual` (PR #123,
branch `claude/virtualized-lists`) to `react-virtuoso`. Only `TaskList` was rebuilt, on branch
`claude/tasklist-virtuoso`; `BoardColumn` and `CardGrid` stay on TanStack. This branch isn't meant
to merge.

**Recommendation: stay on TanStack for all three lists.** The Virtuoso `TaskList` matches the
TanStack one in behaviour, pixels and accessibility, but it is more code, twice the library, and
needs several workarounds against the DOM Virtuoso draws. The one thing Virtuoso does better
(keeping a focused row out from under the stuck heading) is a small fix to port to the TanStack
version. The reasons are at the end.

## What was built

`react-virtuoso` 4.18.20 (`~4.18.20`). `TaskList` keeps its props and behaviour:

- **Flat view** (`tasks`): `Virtuoso`.
- **Grouped view** (`groups`): `GroupedVirtuoso`, with `groupCounts` from the groups (0 rows for a
  collapsed group).
  - Tried first and kept: it has sticky group headings built in. That is the one thing the flat
    `Virtuoso` can't do: it draws only the rows in range and has no hook like TanStack's
    `rangeExtractor` to keep a heading drawn once its place has scrolled away.
- **Rows without wrappers.** `components.Item` _is_ the `TaskRow`: it takes Virtuoso's
  `data-index`, `data-item-index`, `data-known-size` and `style` itself, so the row is what
  Virtuoso measures. `components.Group` is the heading's `role="row"`. `components.TopItemList`
  holds the stuck heading. `components.Footer` holds the `SelectionBar`.
  - The grid's attributes (`role`, `aria-rowcount`, `tabIndex`, key and focus handlers) are passed
    to `Virtuoso` itself, which puts them on its scroller. So no custom `Scroller` was needed.
  - `List` stays Virtuoso's `div`.
- **Rows read state from `context`.** The components are module-level constants, because new ones
  would remount every row, so they get the list's state through Virtuoso's `context` prop.
- **Focus by id.** ↑/↓/Home/End call Virtuoso's `scrollIntoView({ index })` rather than
  `scrollToIndex`. `scrollToIndex` only has `start`/`center`/`end`; `scrollIntoView` scrolls only
  as far as it needs to, like TanStack's `align: 'auto'`.
  - A row registers itself in an effect when it mounts. One waiting for focus takes it then.
  - The list is one tab stop. The list itself takes `tabIndex=0` only while the focused row is
    unmounted, which each row reports from an effect.
- **`onEndReached` / `endReachedThreshold`** come from `rangeChanged`, with the same meaning as
  before: fire once the last drawn row is within the threshold (20), once per list length. It is
  checked again when the length changes, since a longer list may still end within the threshold
  without the drawn range changing.
- **Sizes.** No estimates are kept except `defaultItemHeight: SIZE['row-height']`. It skips
  Virtuoso's probe render and makes the first total right for flat lists. Overscan is
  `increaseViewportBy: 10 × row-height`.

## Lines of code

Counted as total lines, and code lines without blanks or comments.

|                                        | TanStack                                                             | Virtuoso                       |
| -------------------------------------- | -------------------------------------------------------------------- | ------------------------------ |
| `TaskList.tsx`                         | 379 / 298                                                            | 551 / 433                      |
| `TaskList.module.css`                  | 53 / 35                                                              | 69 / 43                        |
| helpers it needs from `lib/virtual.ts` | all of it: 118 / 80 (`useVirtualList`, `paddingBefore`, the warning) | the warning only: about 12 / 8 |
| **total**                              | **about 550 / 413**                                                  | **about 632 / 484**            |

The Virtuoso version is about 17% more code. Most of the growth is the plumbing between the list
and Virtuoso's components:

- the `context` interface;
- separate `Item`, `Row`, `Group`, `TopItemList` and `Footer` components;
- mapping entry indexes to Virtuoso's item indexes.

It also moved the end-reached and dev-warning logic into `TaskList`, because `useVirtualList` is
TanStack's. Code that only TanStack's version needs (`paddingBefore`, `rangeExtractor`, the size
estimates) went away. (`lib/virtual.ts` gained an exported `unboundedWarning` so both versions log
the same text.)

## Bundle size

Measured by bundling only what each list imports, with esbuild, minified, React external, `gzip -9`:

|                                                                                                       | min     | gzip        |
| ----------------------------------------------------------------------------------------------------- | ------- | ----------- |
| `react-virtuoso` 4.18.20 (`Virtuoso`, `GroupedVirtuoso`)                                              | 61.7 kB | **20.6 kB** |
| `@tanstack/react-virtual` 3.14.21 + `virtual-core` 3.19.6 (`useVirtualizer`, `defaultRangeExtractor`) | 34.1 kB | **10.3 kB** |

- **This branch:** BoardColumn and CardGrid still need TanStack, so it adds the full **20.6 kB
  gzipped**.
- **Moving all three lists:** about **+10.3 kB gzipped** net.
- **The app build today:** no page renders `TaskList` yet, so the renderer build tree-shakes both
  out and differs by 177 bytes. The figures above are what a page using the list will pay.

## What got simpler

- **Sticky headings are built in.** TanStack needed a `rangeExtractor` to keep the current heading
  drawn, `paddingBefore` to subtract it from the padding, and sticky-in-flow CSS. Virtuoso stucks
  the current heading in its top item list and starts the drawn rows after it.
- **No size estimates.** There's no per-kind `estimateSize` (a row, a heading with or without the
  gap above it). Virtuoso measures; `defaultItemHeight` is the only hint.
- **No measuring refs.** Nothing to merge (`measureElement` plus our own row ref). Virtuoso
  observes the list's children by their `data-index`.
- **Keyboard scrolling clears the stuck heading.** Virtuoso's `scrollIntoView` keeps the focused
  row out from under it. Pressing ↑ 40 times in "1,000 rows, grouped" leaves the focused row's top
  at 46px, just under the 46px heading. **The TanStack version leaves it at 0, hidden under the
  heading.** That is a bug in PR #123, fixable there with `scrollPaddingStart` (or
  `scroll-padding-top`) set to the heading's height.

## What got harder

- **A list with no height collapses.** Virtuoso's viewport is `position: absolute`, so a scroller
  that sizes itself is 0px tall and draws nothing. See [Short lists](#short-lists).
- **Inline styles to undo.**
  - Virtuoso puts `position: sticky; z-index: 1` on every group item, and `top: 0; z-index: 1`
    on the top item list.
  - `Group` and `TopItemList` override them so the heading, the gap and the rows stack as before.
  - The scroller's inline `height: 100%` has to be replaced through `style`, since a class can't
    beat it.
- **The group-gap had to become an item.**
  - **Why.** Virtuoso sticks a group's heading as soon as the top of its box reaches the top of the
    list. With the gap as padding inside the heading (as before), the heading jumped up 32px at
    every group boundary and a blank strip opened under it.
  - **The fix.** The gap is now the last item of every group but the last. It is a spacer with no
    role and `aria-hidden`, on `--list-ground`. Across a boundary (scrollTop 4830–4900 in steps of
    6), the heading text then sits at exactly the same pixels as in the TanStack version.
  - **The cost.** `aria-rowindex` and `aria-rowcount` have to skip the spacers.
- **The selection bar needs `:has()`.**
  - Virtuoso wraps `components.Footer` in a `div` it measures, exactly as tall as the bar. The bar's
    own `position: sticky` can't move inside it, so the wrapper is made sticky instead:
    `.list [data-viewport-type] > :has(> [data-floating])`.
  - The wrapper is also made `flow-root`. Otherwise the bar's top margin collapses out of it,
    Virtuoso measures 12px short, and the list scrolls 12px (seen in the `Selection` story).
  - This leans on Virtuoso's DOM (`data-viewport-type`), which isn't public API.
- **Components can't close over state.** Every value a row needs goes through `context`. Rows
  that need effects (registering for focus) get their own component under `Item`.
- **Less overscan above in grouped mode.** Virtuoso never draws the rows above the current group's
  heading. That heading is the top of the range until the previous heading takes over, so
  `increaseViewportBy` only works downward there. Nothing blank was seen, but there is less
  margin when scrolling up quickly.
- **The grouped scrollbar estimate is rougher.** With one default height, an unmeasured heading
  (46px) or gap (32px) counts as 48px. The 1,000-row grouped list starts 48,910px tall instead of
  48,748px, and corrects itself as rows are measured. TanStack's per-kind estimates were exact from
  the start.

## Short lists

A list with no height to fill (a task's Subtasks, the stories in a plain `div`) must still draw
all its rows. Here's how this version does it:

1. **The scroller is as tall as the whole list.** `totalListHeightChanged` writes Virtuoso's total
   into `--list-height` on the scroller, and its height is
   `var(--list-height, <row-height>px)`.
   - It is written straight onto the element, not through React state, so a row measuring
     differently doesn't re-render the list.
   - The one-row fallback gives Virtuoso a non-zero viewport on its first pass. It draws the first
     rows, reports a total, and the height grows from there.
2. **CSS lets a container shrink it.** `flex: 1 1 auto; min-height: 0; max-height: 100%`.
   - In a flex column (`PageContent layout="list"`, the stories' `Page`), the whole-list height is
     the flex basis, which shrinks to the room left.
   - Under a parent with a set height, `max-height: 100%` clamps it.
   - With neither, nothing shrinks it, so the list is as tall as its rows and draws them all.
3. **The dev warning still works.** When `rangeChanged` reports 200 or more drawn rows and the
   scroller doesn't overflow, the list logs the same warning as before. Checked in `storybook dev`:
   with the "1,000 rows" container's height removed, the list grew to 48,000px, drew all 1,000 rows
   and logged "TaskList is drawing 200 rows at once: it has no height to fill…". The bounded
   stories logged nothing.

The other option was a non-virtual path for short lists, drawing plain `TaskRow`s below some count.
I didn't take it: it would need a second rendering of the list with its own focus and selection,
and a threshold that is a guess.

## Accessibility

**The question:** does `GroupedVirtuoso` draw the stuck heading as a separate copy outside the
list's flow, so the accessibility tree shows it twice or out of order?

**The answer:** it draws it outside the item list but never twice, and always in order.

- **No duplicate.** The stuck heading is rendered in a `TopItemList` (a sticky `div` before the
  viewport, outside the `List` element). Virtuoso then starts the main list from the item _after_
  that heading (in its source, items before `topItemsIndexes` are skipped). The heading is in the
  DOM once, and first.
- **Same as the TanStack version, which keeps the heading "drawn ahead of the rows."** The grid
  owns both through generic `div`s, so the tree is the same as before.

Checked with Playwright on the built Storybook ("1,000 rows, grouped"), comparing both branches:

**At scrollTop 12,345** (inside group 3), `locator.ariaSnapshot()` of the grid is **byte-identical**
between the two versions. Chromium's full accessibility tree (CDP `Accessibility.getFullAXTree`;
this Playwright no longer has `page.accessibility.snapshot()`) has the same 32 rows in the same
order. The start of the snapshot:

```yaml
- grid:
  - row "Collapse Group 3 Group 3 Tasks 201–300 Add task 100":
    - gridcell "Collapse Group 3 Group 3 Tasks 201–300 Add task 100":
      - heading "Collapse Group 3 Group 3 Tasks 201–300 Add task 100" [level=3]:
        - button "Collapse Group 3" [expanded]
        - text: Group 3 Tasks 201–300
        - button "Add task"
        - text: "100"
  - 'row "Status: Completed Fix calendar sync for recurring events #243 Design system Today"':
    - 'button "Status: Completed"':
      - img "Completed"
    - text: "Fix calendar sync for recurring events #243"
  ...
```

The `aria-rowindex` order is 203, 246, 247, … in both versions: the stuck heading, then the drawn
rows.

**At scrollTop 4,860** (group 2's heading arriving at the top), the versions differ in one row:

|          | `aria-rowindex` of the drawn rows, in DOM order  |
| -------- | ------------------------------------------------ |
| Virtuoso | **1**, 92, 93, …, 101, 102 (Group 2), 103, … 122 |
| TanStack | 92, 93, …, 101, 102 (Group 2), 103, … 122        |

Virtuoso still holds Group 1's heading in its top item list. The gap spacer covers it while
Group 2's heading slides up over it, so on screen nothing differs. TanStack has already dropped it.
Both are in order, and neither repeats a heading. Virtuoso's tree has one more row ("Group 1", at
index 1, ahead of its own rows) for the 30px of scrolling where the two headings overlap.

Every drawn row and heading has `role="row"` and `aria-rowindex`. The grid has `aria-rowcount`
(1000 from `rowCount` in "1,000 rows"; 1010 in the grouped story: 1,000 rows and 10 headings, the
spacers left out).

## Checks

All run on the built Storybooks of both branches with the preinstalled Playwright and Chromium,
plus `storybook dev` for the development warning.

- **`npm run typecheck`, `npm run lint`, `npm test`** (2,483 passed) **and
  `npm run build-storybook`** pass.
- **"1,000 rows":** 21 rows in the DOM (31–32 while scrolled), and `aria-rowcount` reads 1000.
  - Every drawn row sits exactly at (index − 1) × 48px at scrollTop 7,000.
  - Pressing End 12 times walks 100 → 1,000 loaded rows, firing `onEndReached` each time; Home
    returns to row 1.
  - Scrolling alone loads the next page once the last drawn row reaches 80.
  - Every number matches the TanStack branch exactly.
- **Sticky heading:** the current group's heading is at the top of the list at scrollTop 0, 3,000,
  4,790, 12,345, 30,000 and 47,000.
- **Collapsing** Group 1 drops 100 rows: `aria-rowcount` goes 1010 → 910, and Group 2 follows
  Group 1's heading.
- **Selection bar:** with two rows selected and the list scrolled 2,000px, the bar is 16px above
  the list's bottom edge (`--space-4`), as before.
- **One tab stop:**
  - Focus row 5, then scroll it away. Focus falls to `body`, as in the TanStack version, because
    the row unmounts.
  - The grid takes `tabindex="0"` and no row has it.
  - Tab from a button before the list: row 5 is focused and scrolled back into view, and the grid
    drops its tab stop again.
- **Screenshots against `claude/virtualized-lists`:** these 15 stories are pixel-identical (1280 ×
  860):
  - **`Lists/TaskList`:** Default, Selection, Status menu open, Subtasks, Narrow stacked, Grouped,
    1,000 rows, and 1,000 rows grouped;
  - **`Screens/Tasks`:** list, several selected, group, and list (light);
  - **`Screens/TaskDetail`:** both;
  - **`Shell/WorkspaceShell`:** List page.

  One caveat: the first, cold load of "List page" differed in the rows' right-hand pills while they
  settled. Reloading it was identical.

- **Console:** no errors or warnings in any of these stories.

## Things that didn't work

- **The gap as padding on the heading:** the heading jumped 32px at every boundary (above).
- **The bar in `components.Footer` as it was:** it didn't stick, and was measured 12px short
  (above).
- **`page.accessibility.snapshot()`:** removed from this Playwright, so I used `ariaSnapshot()`
  and the CDP accessibility tree instead.
- **Measuring the bundle in the app build:** nothing renders `TaskList` yet, so both libraries are
  tree-shaken out (above).

## Recommendation: stay on TanStack

For `TaskList`, Virtuoso reached parity:

- the same pixels;
- the same accessibility tree;
- the same keyboard behaviour, plus the stuck-heading fix.

It didn't make the component simpler overall:

- **More code:** about 17% more.
- **Bigger:** 20.6 kB against 10.3 kB gzipped.
- **Fragile:** the short-list height, the inline styles to undo, the gap spacer and the `:has()`
  rule all depend on how Virtuoso builds its DOM. Some of that isn't public API (the
  `data-viewport-type` wrapper, and the top item list's place in the scroller). A Virtuoso upgrade
  would have to be re-checked against all of it.

TanStack is headless: we draw every element ourselves, which suits a grid with exact ARIA and
pixel-exact headings.

The other two lists would gain even less:

- **`BoardColumn`**
  - **Gaps:** its cards are 10px apart through TanStack's `gap`. `Virtuoso` has no gap, and
    doesn't support margins on items. That leaves padding inside a wrapper around each
    `BoardCard`, losing "the card is the measured `listitem`."
  - **Sticky headings:** it has none, so Virtuoso's main feature doesn't apply.
- **`CardGrid`**
  - **Rows of cards:** it is virtualized by rows of cards whose column count comes from the window.
    `VirtuosoGrid` assumes items of one size and lays them out itself, so we'd either keep our own
    rows over `Virtuoso` (as we do with TanStack now) or give up the measured rows.

**What to take from the prototype:** in the TanStack `TaskList`, keep the focused row out from
under the stuck heading (`scrollPaddingStart` set to the heading's height, on the virtualizer).
