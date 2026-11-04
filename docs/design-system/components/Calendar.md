# Calendar

react-day-picker drawn as Figma's `MiniCalendar`: Monday first, 12px tabular numerals in Nova's 28px cells with 8px corners, rows 2px apart, single-letter weekdays (20px row) and outside days in `subtle-foreground`. Today is a `now-indicator` square with a white medium number; the selected day (and a range's two ends) `secondary` with a `border-strong` outline and a medium `foreground-strong` number (today selected keeps the outline with a red number); a range's days between are `accent` squares, not a band.

- `variant="mini"` (the calendar sidebar): "June 2026" in 14px medium `foreground` on the left, 24px ‹ › buttons with 12px chevrons at the right, 4px apart; 8px down to the grid.
- `variant="picker"` (DatePicker, DateRangePicker): ‹ June 2026 › with the month centred; with two months the arrows sit at the outer edges.
- A calendar without `mode` (a picture) still draws its days in the cells' squares.

**Base UI:** Base UI has no calendar: keep react-day-picker, inside a Base UI `Popover` for date pickers (see `DatePicker`).
