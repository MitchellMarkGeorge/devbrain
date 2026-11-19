# CalendarUpNext

The calendar page's right panel, between the month picker and the agenda: today's meeting in
progress, or else the next to start. A `card` with the `edge` outline, `radius-lg`, 12px in:

- the heading, "Up next" or "Now" while it runs (12px `muted-foreground`);
- the calendar's `ColourBar` and the title (14px medium `foreground-strong`, cut with "…");
- how soon it starts and its time (12px `subtle-foreground`): "In 14m · 9:00 – 10:00 AM", the
  countdown in `date-today` from an hour before (`eventCountdown`, as `EventRow` words it);
- "Join" (an outline xs button with the video icon) when the event has a meeting link.

The card opens the event on a click or Enter (`onOpen`); Join calls `onJoin`. The panel picks the
event (`upNext` in `CalendarSidePanel`: timed occurrences today that haven't ended, the earliest
first; none once the last has ended, and never an all-day event) and leaves it out of Today's
agenda lines, so it shows once.

- `event`: core's `Event` or an occurrence (`UpNextEventData`: `title`, `startAt`, `endAt`,
  `allDay`, `meetingUrl`, `color`); `calendarColor` for an event with no colour of its own.
- Times read `useFormat('minute')`, so "In 14m" counts down and the time format follows settings.

**Base UI:** No Base UI part: a section with the design system's `Button`.
