# FullCalendar adapter

How the calendar view turns the events `EventService.listForCalendar` returns into FullCalendar event input. Not built yet: this is the spec for the calendar UI. The event model (feature 16b, see [the tech design](../integrations/tech-design.md)) stores events in the shape this needs, so the adapter is one small function on the renderer side.

## Packages

FullCalendar 7: `fullcalendar` (the calendar, with its views under `fullcalendar/list`, `fullcalendar/daygrid` and so on) and `@fullcalendar/rrule`, with their peers `rrule` (already a dependency, for core) and `temporal-polyfill`. There is no Luxon plugin for 7 (`@fullcalendar/luxon` stops at 6) and none is needed: the RRule plugin expands `DTSTART;TZID=…` itself (see [Checked against FullCalendar 7](#checked-against-fullcalendar-7)). The renderer's Vite build bundles all of them; the main process's bundling of `rrule` (`vite/utils.ts`) does not affect it.

## What it receives

`listForCalendar(start, end)` returns every event of the visible calendars that may occur in the range, removed ones left out. Three kinds of item come back:

- **One-off events**: `recurrenceRule` is null. Timed ones have `startAt`/`endAt`; all-day ones also have `startDate`/`endDate` (`YYYY-MM-DD`, end exclusive).
- **Series masters**: `recurrenceRule` holds the provider's RFC 5545 lines (`RRULE`, and possibly `EXDATE`, `RDATE`, `EXRULE`), never `DTSTART`. `startAt`/`endAt` are the series' start, its first occurrence unless the rule skips that day (rrule.js then starts at the first day the rule makes, though RFC 5545 counts the start as an occurrence), `timeZone` is the zone the series expands in, and `exdates` lists the slots it skips.
- **Occurrence rows**: a moved or edited occurrence of a series, as an event of its own. `seriesId` names the master and `originalStartAt` the slot it replaces.

`exdates` merges two sources: the series' cancelled occurrences (`event_exceptions`) and the `originalStartAt` of its occurrence rows. So a moved occurrence appears twice, on purpose: as its own item where it is now, and in the master's `exdates` for the slot it left. The two are fetched independently, so an occurrence moved outside the range, or removed but kept for a linked note, still keeps the series off its original slot.

## Mapping

### One-off timed event (including occurrence rows)

```ts
{
  id: e.id,
  groupId: e.seriesId ?? undefined, // an occurrence row joins its series' group
  title: e.title,
  start: e.startAt,
  end: e.endAt,
  allDay: false,
}
```

### One-off all-day event

```ts
{
  id: e.id,
  title: e.title,
  start: e.startDate, // "2026-07-01"
  end: e.endDate, // "2026-07-02", exclusive as FullCalendar expects
  allDay: true,
}
```

The dates pass through unchanged, with no time zone conversion, which is why the model stores them as text.

### Series master

```ts
{
  id: e.id,
  groupId: e.id, // the same group as its occurrence rows
  title: e.title,
  rrule: [
    dtstartLine(e),
    localLines(e), // e.recurrenceRule with its UTC values made local, see below
    ...e.exdates.map((at) => exdateLine(e, at)),
  ].join('\n'),
  duration: e.allDay
    ? { days: daysBetween(e.startDate, e.endDate) }
    : { milliseconds: e.endAt.getTime() - e.startAt.getTime() },
  allDay: e.allDay,
}
```

**`rrule` is a string, and the exclusions are `EXDATE` lines inside it.** FullCalendar's `exdate` and `exrule` properties only work when `rrule` is an object; with a string, the exclusions go in the string ([RRule plugin](https://fullcalendar.io/docs/rrule-plugin), "Exclusion Properties"). The object form takes the options of a single `new RRule`, so it cannot carry the several lines a provider may send. The string takes `recurrenceRule` as stored, any `EXDATE` the provider wrote included, and `exdates` are appended to it. A slot excluded twice, by the provider's `EXDATE` and by `exdates`, is harmless.

**`DTSTART` and every `EXDATE` use the same form**, since rrule.js matches exclusions against the occurrences it generates:

| Series  | `DTSTART`                                      | `EXDATE`                                      |
| ------- | ---------------------------------------------- | --------------------------------------------- |
| Timed   | `DTSTART;TZID=America/Toronto:20261005T090000` | `EXDATE;TZID=America/Toronto:20261009T090000` |
| All-day | `DTSTART:20261005`                             | `EXDATE:20261009`                             |

A timed line is the instant's wall-clock time in the series' `timeZone` (`Intl.DateTimeFormat` with that zone), so the series stays at 9:00 local across a DST change. An all-day line is the local date of the instant (`toDateString`), which for `startAt` is `startDate`.

**An all-day `DTSTART` has no `VALUE=DATE`.** RFC 5545 writes it `DTSTART;VALUE=DATE:20261005`, but rrule.js 2.8 only reads `DTSTART:` or `DTSTART;TZID=…:`. It ignores the other line, and the series starts today. An `EXDATE;VALUE=DATE:` line works, but the plain form keeps the two alike.

**Every value in the string is local: none is UTC.** In a timed series, a UTC value (`…Z`) anywhere in the string breaks it, so `localLines` rewrites the ones in `recurrenceRule` to local time in the series' zone:

| Stored                    | In the string                                 | Without the rewrite                                                                                                                                                                   |
| ------------------------- | --------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `UNTIL=20261102T135959Z`  | `UNTIL=20261102T085959`                       | the plugin takes the whole rule as zoned and stops converting rrule.js's output, so every occurrence moves with the system zone (right only in UTC), and the series runs past its end |
| `EXDATE:20261103T140000Z` | `EXDATE;TZID=America/Toronto:20261103T090000` | the same, and the occurrence is not excluded                                                                                                                                          |
| `RDATE:20261106T150000Z`  | `RDATE;TZID=America/Toronto:20261106T100000`  | rrule.js drops the `Z` and reads the value as local time, hours off                                                                                                                   |

Stored rules keep UTC values on purpose: RFC 5545 requires a UTC `UNTIL` with a `TZID` start, core writes one when it splits a series ("This and following"), and providers send them. Core expands them correctly; only the string for FullCalendar needs the rewrite. An all-day series' values are dates and need none.

### On every event

- **Colour**: one FullCalendar event source per visible calendar, coloured by `calendar.color`. An event sets `color` only when `e.color` overrides it.
- **`editable: !e.external`**: synced events are read-only.
- **`classNames`** from the display hints: `response` declined (dimmed), `status` tentative (outlined or hatched), `kind` focus time or out of office; perhaps `display: 'background'` for out of office.
- **`extendedProps`**: what a click needs, such as `external` (provider and URL), `seriesId`, `originalStartAt` and `response`.

### Time zone and untrusted values

- **`timeZone: 'local'`**, FullCalendar's default. Core has no time zone setting: dates and day ranges are days in the system zone, which is the renderer's local zone too (see `core/shared/dates.ts`). All-day dates pass through as text; timed events are instants. Only `DTSTART`/`EXDATE`/`RDATE` lines name a zone, the series' own `timeZone`. Keep it `'local'`: with a `TZID`, rrule.js returns occurrences as the system zone's local times, and the RRule plugin reads them in the calendar's zone, so the two must be the same.
- **Colours** are parsed with `hexColorSchema`, and **`external.url` and `meetingUrl`** are opened through `Workspace.openUrl`, never set as an `href` FullCalendar follows (`url` on event input would navigate the window). Titles are text; descriptions are Markdown under the rules in [untrusted content](../security/untrusted-content.md).

## Fetching

Each calendar source's `events(info)` function calls `listForCalendar(info.start, info.end, { calendarIds: [calendar.id] })` over IPC and maps the result. Series are fetched loosely (any that started before the range ends); rrule.js decides which occurrences fall in view, and a series that has ended yields none.

## Example

A weekday standup at 9:00 Toronto time, with Wednesday's moved to 10:00 and Friday's cancelled. `listForCalendar` for Mon Oct 5 to Sun Oct 11 returns the master (with `exdates` Wed 9:00 and Fri 9:00) and Wednesday's occurrence row, which map to:

```js
[
  {
    id: 'evt_standup',
    groupId: 'evt_standup',
    title: 'Standup',
    rrule:
      'DTSTART;TZID=America/Toronto:20261005T090000\n' +
      'RRULE:FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR\n' +
      'EXDATE;TZID=America/Toronto:20261007T090000\n' +
      'EXDATE;TZID=America/Toronto:20261009T090000',
    duration: { milliseconds: 900000 },
    allDay: false,
  },
  {
    id: 'evt_standup_oct7',
    groupId: 'evt_standup',
    title: 'Standup',
    start: new Date('2026-10-07T14:00:00Z'),
    end: new Date('2026-10-07T14:15:00Z'),
    allDay: false,
  },
];
```

FullCalendar draws Monday, Tuesday and Thursday at 9:00 from the master, Wednesday at 10:00 from the occurrence row, and nothing on Friday.

## Editing and deleting a recurring event

An edit or delete of a series' occurrence asks which occurrences it applies to. Each choice is one route:

| Choice             | Edit                                                | Delete                                              |
| ------------------ | --------------------------------------------------- | --------------------------------------------------- |
| This event         | `events.updateOccurrence` with `scope: 'this'`      | `events.deleteOccurrence` with `scope: 'this'`      |
| This and following | `events.updateOccurrence` with `scope: 'following'` | `events.deleteOccurrence` with `scope: 'following'` |
| All events         | `events.update` with `id: seriesId`                 | `events.delete` with `id: seriesId`                 |

The occurrence routes take the series and the occurrence's start in it, `{ seriesId, originalStartAt, scope }`, plus the fields to change for an edit:

- **`originalStartAt`** is the start the occurrence has in the series, matched exactly. For an occurrence FullCalendar expanded from the master, that is its start as expanded (`oldEvent.start` after a drag, `event.start` after a click; local midnight for an all-day series), with `seriesId` the master's `id`. For an occurrence row, it is the row's own `seriesId` and `originalStartAt` (from `extendedProps`), never its `startAt`, which is where it was moved to.
- **"This event" edit** returns the occurrence's own row, made from the series if it had none. It stays on the series' calendar and has no rule of its own, so a `calendarId` or `recurrenceRule` is refused (`invalid_input`).
- **"This event" delete** cancels the occurrence, and deletes its row if it has one.
- **"This and following" edit** ends the series just before the occurrence and returns a new series starting there, with the changes; later occurrence rows and cancellations move to it, shifted as the occurrence was. From the series' first occurrence (the first the rule makes, which is not `startAt` when the rule skips that day), it updates the series itself, moving its start there, and returns it. A null `recurrenceRule` makes the occurrence a one-off.
- **"This and following" delete** ends the series just before the occurrence and removes the later occurrences. From the first occurrence, it deletes the series.
- **Only occurrences the series has** are accepted: ones its rule makes (not removed by an `EXDATE` or `EXRULE` line), or that have an occurrence row or were cancelled. Any other `originalStartAt`, such as one after the series ends, is refused with `invalid_input` and nothing is written.
- **Splitting a rule** ("This and following") is refused for a series with `RDATE`, `EXRULE` or more than one `RRULE`. Offer "All events" instead.
- **Linked occurrences survive.** Deleting a series, or its later part, keeps an occurrence row a note or task links to, as a one-off event with `seriesId` cleared.

**Rules are checked on create and update.** `events.create`, `events.update` and a "This and following" edit take `RRULE`, `EXRULE`, `RDATE` and `EXDATE` lines only, with at least one `RRULE` that rrule.js can expand and no `DTSTART` (the adapter writes it from `startAt`). Anything else is refused with `invalid_input`.

**"All events" from a later occurrence: translate the time change to the first occurrence.** `events.update` on a series takes `startAt`/`endAt` (or `startDate`/`endDate`) as the series' first occurrence; core does not translate a change made on another one. When the user drags the Thursday standup from 9:00 to 10:00 and picks "All events", send the master's `startAt` and `endAt` each moved by the drag's delta, not Thursday's new times. Fields other than timing (title, location) pass through as they are.

The routes' writes reach the other windows as `events` changes, like any other event write: the master's `exdates` or rule changed, and occurrence rows were created, moved or deleted. Refetching the visible range is enough.

## Checked against FullCalendar 7

Checked with `fullcalendar` and `@fullcalendar/rrule` 7.1.3 and rrule 2.8.1, in Chromium with the system zone set to New York, Berlin, Tokyo and UTC: each drew the same instants.

- **`TZID`** works, with no Luxon plugin: a daily 9:00 New York series stays at 9:00 across the end of DST (13:00Z, then 14:00Z), and an `EXDATE;TZID=…` line removes its occurrence.
- **DST gaps and overlaps** are drawn where core puts them: a 2:30 occurrence on the night clocks go from 2:00 to 3:00 at 3:30, and on the night 1:00 to 2:00 repeats, one 1:30, the first. So an occurrence ref from a drawn occurrence matches core's exactly.
- **All-day series** with plain date lines (`DTSTART:`, `EXDATE:`, `UNTIL=` a date) start, skip and end on the right days. `DTSTART;VALUE=DATE:` does not work (see above).
- **`RDATE;TZID=…` and `EXRULE`** lines work in the string form.
- **UTC values** in a timed series break it, so the adapter makes them local (see above).

## To confirm when building it

- **Dragging an occurrence**: that `oldEvent.start` is the occurrence's start as drawn, the `originalStartAt` the occurrence routes need.
- **All-day `duration`** in days, for a series longer than one day.
