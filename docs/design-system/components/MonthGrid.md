# MonthGrid

The month calendar: a 32px row of weekday names (12px `muted-foreground`, 8px in), then five or six equal weeks of cells split by `border` lines. Each cell (6px padding) shows its date in a 24px box (14px medium; today on the red `now-indicator` disc, other months' days `subtle-foreground`), then up to three 20px event lines, 2px apart: the calendar's `ColourBar`, the start time ("9:30", `subtle-foreground`) and the title (12px `foreground`, cut with "…"). All-day events come first and have no time; out of office and focus time have a grey bar; tentative events are at 70%. More than three → "+2 more" (`muted-foreground`), which opens the day.

Props: `month`, `events` (`CalendarEvent[]`), `today`, `weekStartsOn` (1, Monday), `maxEvents` (3), `onEventClick`, `onDayClick`.

**Base UI:** No Base UI part: event lines and dates are buttons.
