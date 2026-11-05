# DateRangePicker

Figma's `DateRangePicker`, 496px: the start and due date picker a task's start pill opens (see `DateRange`), in a `PopoverContent size="auto"` (the popover draws the `popover` surface, `edge` outline, 10px corners and `shadow-md`). Sections are split by full-width `border-strong` lines, as in `DatePicker`.

- **Start → Due fields** (8px around, 8px apart, a 16px `muted-foreground` arrow between them): 32px, 8px corners, the `input` fill and outline, a 12px `muted-foreground` label and the 14px date ("Jun 22"), or "None" while that end is unset. Clicking a field makes it the end being picked (`active`, `onActiveChange`), which takes the `ring` outline; keyboard focus adds the `ring` halo.
- **Two months side by side** (12px around), 24px apart, without outside days: `Calendar`'s `picker` variant in range mode. The range's ends sit on `secondary` with `border-strong` (today keeps its red number there), the days between as `accent` squares. The first month is `defaultMonth`, or the start's month (else the due date's, else today's).
- **Footer** (36px, 12px on the left): the range's length in 12px `muted-foreground` ("10 days", both ends counted; "1 day"), or your `summary`; then a ghost xs "Clear" on the right when `onClear` is given.

Picking a day calls `onChange` with the range (`from` is the start date, `to` the due date); the picker does not move `active` on its own. `rangeLength` gives the footer's count.

**Base UI:** `Popover`; the months are `Calendar` (react-day-picker).
