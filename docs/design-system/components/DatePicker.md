# DatePicker

Figma's `DatePicker`, 248px, for a Start date or Due date: the picker a task's due date pill opens (see `DateRange`), in a `PopoverContent size="auto"` (the popover draws the `popover` surface, `edge` outline, 10px corners and `shadow-md`). Sections are split by full-width `border-strong` lines:

- A natural-language field (8px around it): "Tomorrow, next Fri, Jun 30…"; Enter reads it with `parseNaturalDate` (today, tomorrow, next week, a weekday, a month and day) or your `parse`.
- The month, 12px around it: `Calendar`'s `picker` variant (‹ June 2026 ›, the month centred in 14px medium). Today is the `now-indicator` square, the chosen day `secondary` with a `border-strong` outline, outside days `subtle-foreground`.
- Quick picks 12px below, 6px apart: pill-shaped `outline` xs buttons (Today, Tomorrow, Next week).
- Optional time row (12px × 8px): "Time" in 12px `muted-foreground`, then a `Select` of times with a clock icon.
- Optional footer (8px × 6px): ghost xs "+ Add start date" (turns the due date into a range) and "Clear" on the right.

The start pill opens `DateRangePicker` instead, which shares these sections and lines.

**Base UI:** `Popover`; the month is `Calendar` (react-day-picker).
