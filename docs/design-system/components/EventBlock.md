# EventBlock

A block on the day and week grid (`CalendarView` places it): `muted` ground, `border-strong` outline, `radius-md`, 8px padding, the title (12px medium) over the time (12px `subtle-foreground`, 2px between), a video icon when it has a meeting link. 48px per hour; a block is 2px shorter than its slot.

- `kind`: `event` (default) shows the calendar's 3px colour bar; `task` (a task scheduled on the grid) shows its 12px `StatusIcon` instead (`status`, a `TaskStatus`, not started by default; `overdue` shows the overdue flag, for a task past its due date and not started); `focus` (focus time) has a `muted-foreground` bar and a dashed outline.
- `tentative`: you answered "maybe": dashed outline at 70% opacity; the time line ends "· Maybe".
- `size="compact"` for blocks under 40px (30 minutes and less): one line, the bar 12px tall; the grid drops the time.
- `AllDayEvent`: the all-day row's 22px chip, `radius-md`, in the calendar's tile colour (`swatch-*-tile`) with its `ColourBar` and a `foreground-strong` 12px title. A colour that is not a swatch (a synced calendar's `#rrggbb`) is mixed to match: 30% over `background` for the tile, 15% for the light theme's tint. `kind="out-of-office"` is a neutral `muted` chip with a grey bar and `muted-foreground` title. In the light theme the chip is the swatch's 15% tint (the Figma light screen keeps the dark 900 tile, which leaves the title unreadable).
- `NowIndicator`: the 1px `now-indicator` line across today's column, its 8px dot at the column's left edge.

**Base UI:** No Base UI part: `useRender`, so `render` can make a block a link or a button.
