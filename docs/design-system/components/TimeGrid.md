# TimeGrid

The day and week calendar, driven by event data. A 60px gutter, then one column per day:

- **Day headers** (40px): the weekday (12px `muted-foreground`) and the date (14px medium `foreground-strong`); today's date sits on a 24px `now-indicator` disc with a white number.
- **All-day row**: "All day" in the gutter (`subtle-foreground`), `AllDayEvent` chips spanning the days they cover, 4px in from the column lines, stacked in 22px rows 4px apart (32px for one row).
- **Hours**: 48px each, the label (12px `subtle-foreground`) right-aligned 12px from the gutter's edge and centred on its `border` line; 8px of space above the first line. Columns are split by `border` lines.
- **Events** are placed by `start` and `end`: 3px in from the column's sides, overlapping events side by side 2px apart, 16px at the least. Under 40px they use the compact `EventBlock` (title only).
- **Now**: the red `NowIndicator` in today's column, at `now`.

Props: `days` (Dates, one column each: seven for the week, one for the day view), `events` (`CalendarEvent[]`: `{ id, title, start, end, allDay?, color?, kind?: 'event' | 'task' | 'focus' | 'out-of-office', status?, tentative?, meeting? }`, all-day `end` exclusive), `now`, `startHour`/`endHour` (0–24), `scrollToHour`, `hourHeight` (48), `onEventClick`, `selectedEventId`, `formatEventTime`. The headers and all-day row stay put while the hours scroll.

`calendar-events.ts` exports the date helpers and the layout (`layoutOverlaps`, `layoutAllDay`) for other views.

**Base UI:** No Base UI part: plain markup.
