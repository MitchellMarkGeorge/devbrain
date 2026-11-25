# MentionList

What mentions an item, as `MentionRow`s, most recently changed first (the order `mentions.list` returns). A sheet's "Mentioned in" (`MentionsSection`) and a page's popover (`MentionsPill`) both draw it.

- **Rows**: the first `limit` (5 by default), then **"Show n more"**, a quiet 28px text button in 12px `subtle-foreground` (`foreground` on hover), 4px under the rows, which shows the rest. A popover passes `limit={Infinity}` and scrolls instead.
- **None**: "Nothing mentions this yet", one 36px line in 14px `subtle-foreground`. The app leaves the section and the pill out while nothing mentions an item, so this shows only when the last mention goes while the list is open.
- `onOpen(mention)` opens a row's source.

- Stories: `Default` (seven: five and "Show 2 more"), `Few`, `Empty`.

**Base UI:** No Base UI part: plain markup.
