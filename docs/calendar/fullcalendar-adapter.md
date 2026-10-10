# FullCalendar adapter

How the calendar view turns the events `EventService.listForCalendar` returns into FullCalendar event input. Not built yet: this is the spec for the calendar UI. The event model (feature 16b, see [the tech design](../integrations/tech-design.md)) stores events in the shape this needs, so the adapter is one small function on the renderer side.

## What it receives

`listForCalendar(start, end)` returns every event of the visible calendars that may occur in the range, removed ones left out. Three kinds of item come back:

- **One-off events**: `recurrenceRule` is null. Timed ones have `startAt`/`endAt`; all-day ones also have `startDate`/`endDate` (`YYYY-MM-DD`, end exclusive).
- **Series masters**: `recurrenceRule` holds the provider's RFC 5545 lines (`RRULE`, and possibly `EXDATE`, `RDATE`, `EXRULE`), never `DTSTART`. `startAt`/`endAt` are the first occurrence, `timeZone` is the zone the series expands in, and `exdates` lists the slots it skips.
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
    e.recurrenceRule,
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
| All-day | `DTSTART;VALUE=DATE:20261005`                  | `EXDATE;VALUE=DATE:20261009`                  |

A timed line is the instant's wall-clock time in the series' `timeZone` (`Intl.DateTimeFormat` with that zone), so the series stays at 9:00 local across a DST change. An all-day line is the local date of the instant (`toDateString`), which for `startAt` is `startDate`.

### On every event

- **Colour**: one FullCalendar event source per visible calendar, coloured by `calendar.color`. An event sets `color` only when `e.color` overrides it.
- **`editable: !e.external`**: synced events are read-only.
- **`classNames`** from the display hints: `response` declined (dimmed), `status` tentative (outlined or hatched), `kind` focus time or out of office; perhaps `display: 'background'` for out of office.
- **`extendedProps`**: what a click needs, such as `external` (provider and URL), `seriesId`, `originalStartAt` and `response`.

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

## To confirm when building it

- **`TZID`.** The RRule plugin page only describes a `Z` suffix and the calendar's own `timeZone`. Expanding `DTSTART;TZID=…` correctly across DST likely needs `@fullcalendar/luxon` alongside `@fullcalendar/rrule`. Check it, and check that `EXDATE;TZID=…` lines match the generated occurrences. If `TZID` is not supported, a UTC `DTSTART` and `EXDATE`s (`…Z`) work but drift an hour after a DST change.
- **All-day series** with `VALUE=DATE` lines, and their `duration` in days.
- **Provider lines** beyond `RRULE` (`RDATE`, `EXRULE`) in the string form.
