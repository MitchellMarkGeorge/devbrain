# HomeRow

Figma's `FocusMeetingRow` and `ProjectRecentRow`: Home's minimal row for meetings (`HomeMeetingRow`) and recent projects (the generic `HomeRow`, given its parts). Lighter than the lists' rows: 36px, 16px in at the sides, no selection strip and no checkbox, 8px corners, 10px between parts.

- **Glyph:** 16px (`icon`): the calendar's `ColourBar` for a meeting, a project's folder in its colour.
- **Title:** 14px `foreground-strong`, one line ending in "…".
- **Its own parts** (`children`), then **`meta`** at the right: 12px `muted-foreground`, right-aligned in 72px; `metaTone="today"` or `"overdue"` colours it.
  - **Meeting:** a `HomeMeetingRow`, drawn from core's `Event` as it is (`event`, typed `HomeMeetingData`: `title`, `startAt`, `endAt`, `allDay`, `meetingUrl`, `color`). Its bar takes the event's colour, else `calendarColor`, else green (`resolveColor`). The next or current meeting is `current` (filled with `card`) and counts down in `date-today` ("In 12m", "Now"; `eventCountdown`). An xs default "Join" (video icon) shows when the row has `onJoin` and the event a `meetingUrl`; the page passes `onJoin` from 5 minutes before the start until the end. Other meetings show their start in the time format from settings ("10:30 AM"), with the weekday on another day ("Tue 9:30 AM"), or "All day". Finished meetings drop off (the page leaves them out); tomorrow's first meeting is `muted` (title and glyph at 50%).
  - **Project:** a 96px `Progress` bar, "3/12" as a 36px `HomeRowNote`, then the due date ("Due Jul 1") or the status ("On hold").
- Hover takes `row-selected`; with `onOpen` the row takes focus (a 1px `ring` outline) and Enter or a click opens it.

**Base UI:** No Base UI part: plain markup.
