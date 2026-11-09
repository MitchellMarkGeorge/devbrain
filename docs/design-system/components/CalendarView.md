# CalendarView

The calendar's week, day and month views: [FullCalendar](https://fullcalendar.io) 7
(`@fullcalendar/react` with its `timegrid`, `daygrid` and `interaction` plugins, and
`@fullcalendar/rrule`), themed to the design system and
drawing its events with `EventBlock` and `AllDayEvent`. It replaces the hand-made `TimeGrid` and
`MonthGrid`, whose look it keeps. Presentational: the page passes event sources and callbacks and
drives `view` and `date`; FullCalendar's own header toolbar is off.

## Week and day

A 60px gutter, then one column per day (seven for the week, one for the day):

- **Day headers** (40px): the weekday (12px `muted-foreground`) and the date (14px medium
  `foreground-strong`); today's date sits on a 24px `now-indicator` disc with a white number.
  No lines between the headers; one `border` line under them.
- **All-day row**: "All day" in the gutter (`subtle-foreground`), `AllDayEvent` chips spanning the
  days they cover, 4px in from the column lines, stacked in 22px rows 4px apart (32px for one row).
  More than `maxEvents` → "+N more".
- **Hours**: 48px each (`slotMinHeight`), the label (12px `subtle-foreground`) right-aligned 12px
  from the gutter's edge and centred on its `border` line. The first hour's line is the all-day
  row's, at the top of the scroller, so its label is hidden rather than cut in half. Columns are split by
  `border` lines. Only the hour lines are drawn, though a click or drag snaps to 15 minutes.
- **Events** are placed by start and end: 3px in from the column's sides, overlapping events side
  by side 2px apart, 1px clear of the slot above and below (2px shorter than their time), 16px at
  the least. Under 40px (30 minutes and less) they use the compact `EventBlock` (title only).
  A timed out-of-office event is drawn as focus time.
- **Now**: the red `NowIndicator` (1px line, 8px dot at the left edge) in today's column, at `now`.
  Today's column has no tint.

The headers and all-day row stay put while the hours scroll; the view opens scrolled to
`scrollToHour`.

## Month

A 32px row of weekday names (12px `muted-foreground`, 8px in), then five or six equal weeks of cells
split by `border` lines (no outer frame). Each cell (6px padding) shows its date in a 24px box (14px
medium; today on the red `now-indicator` disc, other months' days `subtle-foreground`), then up to
`maxEvents` (3) 20px event lines, 2px apart: the calendar's `ColourBar`, the start time ("9:30",
`subtle-foreground`) and the title (12px `foreground`, cut with "…"). All-day events come first and
have no time; one that spans days is one line across them. Out of office and focus time have a grey
bar and a `muted-foreground` title; tentative events are at 70%. More than `maxEvents` → "+2 more"
(`muted-foreground`), which calls `onDayClick` (or opens FullCalendar's popover when there is none).
The date is a link to the day when `onDayClick` is set.

## Events

Each event's look comes from its `extendedProps` (`CalendarViewEventProps`), which the adapter's
`toEventInput` sets from core's event:

- `kind`: `event` (default), `task` (a task on the grid: its `status` icon), `focus` (neutral bar,
  dashed), `out-of-office` (a neutral chip all-day, focus time when timed).
- `tentative`: dashed at 70%, the time line ending "· Maybe".
- `declined`: the whole event at 50%.
- `meeting`: the video icon.

The colour is FullCalendar's: the event's own `color`, else its source's (one source per calendar).
A swatch name (`'green'`) or a `#rrggbb` both work. FullCalendar's own event chrome (fill, border,
shadow) is removed; the selected event (`selectedEventId`) and a focused one get the `ring` outline.
Events are focusable and open on Enter when `onEventClick` is set.

## Props

`view` (`'week' | 'day' | 'month'`), `date` (a day in the range; later changes call
`changeView`), `eventSources` (FullCalendar `EventSourceInput[]`), `firstDay` (1 Monday, 0 Sunday,
from `firstDayOfWeek`), `timeFormat` (`'12' | '24'`: "9:00 – 10:00 AM" or "09:00 – 10:00", hour
labels "8 AM" or "08:00"), `hideWeekends` (FullCalendar's `weekends: false`), `now`, `startHour`/
`endHour` (0–24), `scrollToHour` (8), `maxEvents` (3), `selectedEventId`, `allDayLabel`,
`onEventClick(event, info)` (the occurrence clicked: its `id`, `groupId`, `start` as drawn,
`end`, `allDay` and `props`), `onSelect({ start, end, allDay })` (a drag on empty grid, or a click,
which selects one 15-minute slot or one day; selecting is off without it), `onDayClick(day)`,
`onLoading(loading)`. The ref's `getApi()` returns FullCalendar's API, for `refetchEvents()`.

`calendarEventInput(event)` turns a `CalendarEvent` (the shape the stories and screens use) into
FullCalendar input.

## Theming

FullCalendar 7 draws nothing of its own look: `@fullcalendar/react/skeleton.css` lays it out, and
every part takes its classes from a `…Class` option. `CalendarView` passes its own (`THEME` in
`CalendarView.tsx`), all from `CalendarView.module.css` on the tokens, in place of one of
FullCalendar's themes: the header row and its `border` divider, the all-day and hour gutters
(`allDayHeader…`, `slotHeader…`, at least 60px), the hour lines (`slotLane`), the day columns
(`dayLane`, a `border` line between them), the month's rows and cells (`dayRow`, `dayCell`, with
6px of padding in its top and bottom spacers), bare event frames (`blockEvent`, `rowEvent`,
`columnEvent`) and "+N more". No rule reaches into FullCalendar's own class names, which are
mangled and change between versions. The CSS ships in the app's bundle; FullCalendar 7 injects no
`<style>` element and no font, so the renderer's CSP needs nothing for it.

Differences from the old grids: the first and last hour lines have no label, the hours start right
under the all-day row (no 8px gap above the first line), and a multi-day all-day event in the
month is one spanning line rather than one per day.

**Base UI:** No Base UI part: FullCalendar.
