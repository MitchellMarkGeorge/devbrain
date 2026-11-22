# CalendarUpNext

The calendar page's right panel, between the month picker and the agenda: today's meeting in
progress, or else the next to start. A `card` with the `edge` outline, `radius-lg`, 12px in:

- the heading, "Up next" or "Now" while it runs (12px `muted-foreground`);
- the calendar's `ColourBar` and the title (14px medium `foreground-strong`, cut with "…");
- how soon it starts and its time (12px `subtle-foreground`): "In 14m · 9:00 – 10:00 AM", the
  countdown in `date-today` from an hour before (`eventCountdown`);
- "Join" (an outline xs button with the video icon) when the event has a meeting link.

With `onOpen`, the title is a button that opens the event, and its click area and focus ring cover
the whole card (the card fills with `accent` on hover); Join sits above it and calls `onJoin`. The
card is not a landmark: its "Up next" heading is enough to find it, inside the panel's own region. The panel picks the
event (`upNext` in `CalendarSidePanel`: timed occurrences today that haven't ended, the earliest
first; none once the last has ended, and never an all-day event) and leaves it out of Today's
agenda lines, so it shows once.

- `event`: core's `Event` or an occurrence (`UpNextEventData`: `title`, `startAt`, `endAt`,
  `allDay`, `meetingUrl`, `color`); `calendarColor` for an event with no colour of its own.
- Times read `useFormat('minute')`, so "In 14m" counts down and the time format follows settings.

**Base UI:** No Base UI part: a `div` with a heading, a native button and the design system's `Button`.
