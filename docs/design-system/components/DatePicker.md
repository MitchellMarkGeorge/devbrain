# DatePicker and DateRangePicker

The pickers a task's date pills open, in a `PopoverContent size="auto"` (the popover draws the `popover` surface, `edge` outline, 10px corners and `shadow-md`). Sections are split by full-width `border-strong` lines.

## DatePicker

Figma's `DatePicker`, 248px, for a Start date or Due date:

- A natural-language field (8px around it): "Tomorrow, next Fri, Jun 30…"; Enter reads it with `parseNaturalDate` (today, tomorrow, next week, a weekday, a month and day) or your `parse`.
- The month, 12px around it: `Calendar`'s `picker` variant (‹ June 2026 ›, the month centred in 14px medium). Today is the `now-indicator` square, the chosen day `secondary` with a `border-strong` outline, outside days `subtle-foreground`.
- Quick picks 12px below, 6px apart: pill-shaped `outline` xs buttons (Today, Tomorrow, Next week).
- Optional time row (12px × 8px): "Time" in 12px `muted-foreground`, then a `Select` of times with a clock icon.
- Optional footer (8px × 6px): ghost xs "+ Add start date" (turns the due date into a range) and "Clear" on the right.

## DateRangePicker

Figma's `DateRangePicker`, 496px, opened from the start pill:

- Start → Due fields (8px around, 8px apart): 32px, 8px corners, the `input` fill and outline, a 12px `muted-foreground` label and the 14px date; the end being picked takes the `ring` outline.
- Two months side by side, 24px apart, without outside days: the range's ends on `secondary` with `border-strong` (today keeps its red number there), the days between as `accent` squares.
- Footer: the range's length ("10 days", both ends counted) in 12px `muted-foreground`, "Clear" on the right.

**Base UI:** `Popover`; the month is `Calendar` (react-day-picker).
