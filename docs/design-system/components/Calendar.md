# Calendar

react-day-picker drawn as Figma's `MiniCalendar`: Monday first, 12px tabular numerals in Nova's 28px cells with 8px corners, rows 2px apart, single-letter weekdays (20px row) and outside days in `subtle-foreground`. Today is a `now-indicator` square with a white medium number; the selected day `secondary` with a `border-strong` outline and a medium `foreground-strong` number (today selected keeps the outline with a red number). A range is one continuous `accent` band per week, drawn on the cells so there are no gaps between days, running from the centre of its start to the centre of its end; the two ends fill with `primary` (a step above the band, as `secondary` and `accent` are the same grey in dark; today at an end keeps the end's `primary-foreground` number inside a 2px `now-indicator` ring, as a red number on `primary` falls below 4.5:1), and a band that crosses weeks rounds off at each row's edge. (Figma draws separate `accent` squares; the band was chosen over it.)

- `variant="mini"` (the calendar sidebar): "June 2026" in 14px medium `foreground` on the left, 24px ‹ › buttons with 12px chevrons at the right, 4px apart; 8px down to the grid.
- `variant="picker"` (DatePicker, DateRangePicker): ‹ June 2026 › with the month centred; with two months the arrows sit at the outer edges.
- A calendar without `mode` (a picture) still draws its days in the cells' squares.

**Base UI:** Base UI has no calendar: keep react-day-picker, inside a Base UI `Popover` for date pickers (see `DatePicker`).
