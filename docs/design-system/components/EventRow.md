# EventRow

A calendar event inside a list (Home, Inbox), on the same strokeless `row-height` (48px) row as `TaskRow`: the colour bar (the event's colour, else `calendarColor`, else `swatch-green`, through `resolveColor`), the title, then the day when it is not today ("Tomorrow, "), the time ("10:00 AM – 10:30 AM" in the settings' 12 or 24 hour clock, or "All day") and how it repeats ("Weekly", from its RRULE); on the right an xs "Join" button when it has a `meetingUrl` (`onJoin`) and how soon it is (`formatRelative`: "In 12m"; "Now" while it runs, in `date-overdue` from an hour before the start to the end, `date-today` later today).

`event`: core's `Event` (or an occurrence) as it is (`EventRowData`: `title`, `startAt`, `endAt`, `allDay`, `recurrenceRule`, `meetingUrl`, `color`).
