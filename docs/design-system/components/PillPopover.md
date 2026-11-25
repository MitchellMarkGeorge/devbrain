# PillPopover

A pill on a page that opens a short list in a popover under it: a note's "2 tasks · 1 in progress", "@ 7 mentions" on a task's links line, a note's header or a project's. A page shows these lists this way, so the page doesn't grow by them; a sheet shows the same lists as folded sections instead (`MentionsSection`).

- **Pill**: an interactive `EntityPill` with the list's glyph (`AtSign`, `CircleCheck`) and its label. Extra props go to the pill (`data-testid`, `aria-label`).
- **Popover**: 340px with 4px padding, under the pill and aligned to its start (`Popover`, `size="auto"`), not taking focus as it opens.
- **Heading**: 28px, the list's name in 12px `muted-foreground` ("Tasks", "Mentioned in", as the `PopoverTitle` that names the popover), then `action` on the right: xs ghost buttons ("Link", "New").
- **Body**: the list (`MentionList`, `LinkedTaskRow`s), scrolling past 360px.
- Uncontrolled through `defaultOpen` (closed), or controlled with `open` and `onOpenChange`: a page closes it when a row opens something (the task sheet, another page) or a button opens a dialog.

- Stories: `Tasks` (open), `Closed`.

**Base UI:** `Popover` (`Root`, `Trigger`, `Popup`, `Title`).
