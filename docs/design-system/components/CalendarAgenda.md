# CalendarAgenda

The calendar page's right panel under the month picker: a day's heading ("Today", "Tomorrow", 12px `muted-foreground`) over 28px rows 4px apart. A row has a 16px glyph (the event's `ColourBar`, or a due task's `StatusIcon`), the title (14px `foreground`, cut with "…") and the time on the right (12px `subtle-foreground`: "9:00 AM", "All day", "Due"). Rows fill with `accent` on hover.

- `CalendarAgenda` `{ title }` wraps `CalendarAgendaItem`s, each drawn from core's shape as it is: `event` (an `Event` or an occurrence, `AgendaEventData`: `title`, `startAt`, `endAt`, `allDay`, `color`) with an optional `calendarColor`, or `task` (a `Task` due that day, `AgendaTaskData`: `title`, `status`, `dueDate`).
- An event's bar takes its own colour, else `calendarColor`, else green (`resolveColor`); its time is its start in the time format from settings (`useFormat()`'s `formatTime`) or "All day". A task shows its `StatusIcon`, with the overdue flag while it is overdue and not started, and "Due".

**Base UI:** No Base UI part: a list.
