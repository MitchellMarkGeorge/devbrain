# CalendarAgenda

The calendar page's right panel under the month picker: a day's heading ("Today", "Tomorrow", 12px `muted-foreground`) over 28px rows 4px apart. A row has a 16px glyph (the event's `ColourBar`, or a due task's `StatusIcon`), the title (14px `foreground`, cut with "…") and the time on the right (12px `subtle-foreground`: "9:00 AM", "All day", "Due"). Rows fill with `accent` on hover.

- `CalendarAgenda` `{ title }` wraps `CalendarAgendaItem` `{ title, time?, color?, status? }`.

**Base UI:** No Base UI part: a list.
