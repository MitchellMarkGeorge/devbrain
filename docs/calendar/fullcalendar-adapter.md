# FullCalendar adapter

How the calendar view turns the events `EventService.listForCalendar` returns into FullCalendar event input. The event model (feature 16b, see [the tech design](../integrations/tech-design.md)) stores events in the shape this needs. The adapter is `src/renderer/shared/lib/calendar`: `toEventInput(event, calendar)` and `toEventSource(calendar, load)` in `event-input.ts`, and the rule string in `recurrence.ts`, tested in `src/renderer/tests/shared/calendar`. Reading a rule and expanding it (`seriesRule`, `occurrenceStarts`, `occurrencesBetween`) is `src/common/recurrence.ts`, which core's occurrence edits use too, so core accepts exactly the occurrences the calendar draws. `CalendarView` ([its guide](../design-system/components/CalendarView.md)) draws the result.

FullCalendar is 7.1.3, pinned: `@fullcalendar/react` (which has the `timegrid`, `daygrid` and `interaction` plugins under subpaths, and is built on `@full-ui/headless-calendar` and `temporal-polyfill` 1.0.6) and `@fullcalendar/rrule`. 7.1.3 rather than the newest 7.1.4, which, with the polyfill version it requires, was two days old when this was written; move up once they have settled. The v6 packages (`@fullcalendar/core` as a calendar, `timegrid`, `daygrid`, `interaction`, `luxon3`) are not used: v7 has no separate view or Luxon plugins, and `@fullcalendar/core` is now types only.

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
  groupId: e.seriesId ?? undefined, // an all-day occurrence row too
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
    ...ruleLines(e.recurrenceRule), // rewritten, see below
    ...e.exdates.map((at) => exdateLine(e, at)),
  ].join('\n'),
  duration: e.allDay
    ? { days: daysBetween(e.startDate, e.endDate) }
    : { milliseconds: e.endAt.getTime() - e.startAt.getTime() },
  allDay: e.allDay,
}
```

**`rrule` is a string, and the exclusions are `EXDATE` lines inside it.** FullCalendar's `exdate` and `exrule` properties only work when `rrule` is an object; with a string, the exclusions go in the string ([RRule plugin](https://fullcalendar.io/docs/rrule-plugin), "Exclusion Properties"). The object form takes the options of a single `new RRule`, so it cannot carry the several lines a provider may send. The string takes the lines of `recurrenceRule`, rewritten as below, and `exdates` are appended to it. A slot excluded twice, by the provider's `EXDATE` and by `exdates`, is harmless.

**`DTSTART` and every `RDATE` and `EXDATE` are local times in one form**, since rrule.js matches dates against the occurrences it generates:

| Series  | `DTSTART`                                      | `RDATE` / `EXDATE`                            |
| ------- | ---------------------------------------------- | --------------------------------------------- |
| Timed   | `DTSTART;TZID=America/Toronto:20261005T090000` | `EXDATE;TZID=America/Toronto:20261009T090000` |
| All-day | `DTSTART:20261005`                             | `EXDATE:20261009`                             |

A timed line is the instant's local time in the series' zone (`timeZone`, or the system zone when it is null, as core does), so the series stays at 9:00 local across a DST change. An all-day line is the date: `startDate` for `DTSTART`, the local date of the instant for an `exdates` entry. The all-day `DTSTART` has no `VALUE=DATE`, because rrule.js drops a `DTSTART;VALUE=DATE:…` line without an error and the series then starts now (see the findings below).

**The provider's lines are rewritten, not passed through.** rrule.js reads every `RDATE` and `EXDATE` value in `DTSTART`'s `TZID` whatever its own, and compares `UNTIL` with the local times it generates; and FullCalendar takes any `…Z` value after `EXDATE:` or `UNTIL=` as a sign that the rule is in UTC, which draws a `TZID` series hours off. The first two are rrule's, and core expands with rrule too, so the reading is shared: `seriesRule` (`src/common/recurrence.ts`) reads the stored rule, and the adapter's `rruleString` writes that reading for FullCalendar. Together they:

- keeps `RRULE`, `EXRULE`, `RDATE` and `EXDATE` lines and drops anything else (a provider's own `DTSTART`);
- writes each `RDATE` and `EXDATE` value as the local time it names in the series' zone (a `…Z` value is that instant, a `TZID` or floating one that local time in its zone or the series'), one line per value, in the form above; a value that is not a date is dropped;
- rewrites a UTC `UNTIL` (which RFC 5545 requires with a `TZID` start, and Google sends) as the local time it is in the series' zone, `UNTIL=20261102T085959`; for an all-day series it only drops the `Z`.

**A rule rrule.js cannot read** (a provider's rule is stored as sent) would make FullCalendar throw for the whole source, so such a series is drawn as a one-off at its first occurrence.

### On every event

- **No `undefined` values.** FullCalendar refines every key the input has, so `groupId: undefined` becomes the group `"undefined"`, shared by every one-off event, and `color: undefined` the colour `"undefined"`. A property without a value is left out.
- **Colour**: one FullCalendar event source per visible calendar, coloured by `calendar.color` (`toEventSource`). An event sets `color` only when `e.color` is a valid colour other than its calendar's.
- **`editable: false` for a synced event** (`e.external`); a local one leaves it to the calendar's `editable`, which is off until dragging is designed (an event's `editable: true` would override it).
- **Display hints in `extendedProps`**, which `CalendarView` reads and turns into its own classes: `kind` (`'focus'`, `'out-of-office'` or `'event'`), `tentative` (`status` tentative or `response` tentative), `declined` (`response` declined: dimmed) and `meeting` (a `meetingUrl`). Out of office is drawn as a neutral chip all-day and as focus time when timed, not as a background event.
- **`extendedProps`** also carry what a click needs: `calendarId`, `external` (provider and URL), `seriesId`, `originalStartAt`, `response` and `recurring` (a series master, whose clicked start is the occurrence's).

### Time zone and untrusted values

- **`timeZone: 'local'`**, FullCalendar's default. Core has no time zone setting: dates and day ranges are days in the system zone, which is the renderer's local zone too (see `core/shared/dates.ts`). All-day dates pass through as text; timed events are instants. Only `DTSTART`/`EXDATE` lines name a zone, the series' own `timeZone`.
- **Colours** are parsed with `hexColorSchema`, and **`external.url` and `meetingUrl`** are opened through `Workspace.openUrl`, never set as an `href` FullCalendar follows (`url` on event input would navigate the window). Titles are text; descriptions are Markdown under the rules in [untrusted content](../security/untrusted-content.md).

## Fetching

Each calendar source's `events(info)` function calls `listForCalendar(info.start, info.end, { calendarIds: [calendar.id] })` over IPC and maps the result; `toEventSource(calendar, load)` builds the source around such a `load`. Series are fetched loosely (any that started before the range ends); rrule.js decides which occurrences fall in view, and a series that has ended yields none.

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

## Occurrences outside FullCalendar

`occurrencesBetween(event, start, end)` lists one event's occurrences overlapping a range, for Home and the agenda: a one-off (or occurrence row) is its own occurrence when it overlaps; a series is expanded from the same reading (`seriesRule`), its `RRULE`s and `RDATE`s less its `EXRULE`s, `EXDATE`s and `exdates`. It is in `src/common/recurrence.ts`, with the expansion core's occurrence checks (`isOccurrence`, `hasOccurrenceBefore`) use: in local time with no zone, each occurrence turned back into an instant with Luxon. Pass the series' occurrence rows too, as `listForCalendar` returns them.

A test expands the same events with FullCalendar and with `occurrencesBetween` under four system zones (Toronto, London, Tokyo, UTC) and checks they agree on every start, and on every end of an all-day series. A timed end can differ only for an occurrence that spans a DST change of the system zone: FullCalendar adds the duration in local time, `occurrencesBetween` as elapsed time.

## Findings

Found with FullCalendar 6.1.22 and rrule 2.8.1, and checked again with FullCalendar 7.1.3, whose RRule plugin is the same code (the same `analyzeRRuleString` and expansion), by rendering FullCalendar under happy-dom in each system zone (`src/renderer/tests/shared/calendar/recurrence.test.ts`).

- **`DTSTART;TZID=…` needs no time zone plugin.** rrule.js expands a `TZID` series itself (through `Intl`), and FullCalendar draws it at the right instants in every system zone: a daily 9:00 Toronto series is at 13:00Z before 1 November 2026 and 14:00Z after. (In v6 a named `timeZone` option needed `@fullcalendar/luxon3`; v7 has Temporal for that, and the calendar uses `timeZone: 'local'` anyway.) FullCalendar's analysis of the string only looks for `DTSTART:`, `EXDATE:` and `UNTIL=`, so a `TZID` line is left to rrule.js, which is what makes this work.
- **`EXDATE;TZID=…` lines match** the generated occurrences when they are in the series' zone. rrule.js ignores an `EXDATE`'s or `RDATE`'s own `TZID` and reads the value in `DTSTART`'s, so a value in another zone, or in UTC, must be rewritten first.
- **A `…Z` anywhere breaks a `TZID` series.** A `UNTIL=…Z` or an `EXDATE:…Z` makes FullCalendar treat rrule's results as UTC, and the whole series moves by the zone's offset (a 9:00 Toronto standup drawn at 5:00 or 4:00). Hence the rewriting above. rrule.js also compares `UNTIL` with local times, so a UTC `UNTIL` west of UTC would keep one occurrence too many even if FullCalendar read it right, and east of UTC drop one. Core had that bug (a "following" split west of UTC left the split occurrence in the old part) until it moved to the shared reading.
- **DST edges agree with core.** A 2:30 occurrence on the night clocks go from 2:00 to 3:00 is drawn at 3:30 (core: moved forward by the change), and a 1:30 occurrence on the night 1:00 to 2:00 repeats is drawn at the first 1:30 (core: the first), in every system zone. So an occurrence's drawn start is the `originalStartAt` core expects. The drawn end of such an occurrence can be off when the repeat is in the system's own zone, since FullCalendar adds the duration in local time.
- **All-day series:** `DTSTART;VALUE=DATE:20261005` is silently dropped by rrule.js (the series starts now); `DTSTART:20261005` works, and so do `EXDATE`/`RDATE` with or without `VALUE=DATE`, and comma-separated lists. Occurrences start at local midnight of their dates in every system zone, and `duration: { days }` gives their length.
- **Provider lines in the string form:** `RDATE` adds occurrences, `EXRULE` removes them, and two `RRULE` lines both make occurrences, in the string FullCalendar passes to `rrulestr`.
- **CSP:** FullCalendar 7 ships plain CSS (`skeleton.css`, bundled with the app's) and injects no `<style>` element and no font; checked in Chromium with the renderer's policy on a production Storybook build. (v6 injected a `<style>` element, which needed `'unsafe-inline'`, and an icon font as a `data:` URL, which the CSP blocked with a console warning.)
- **In tests:** `@fullcalendar/rrule` does `import * as rruleLib from 'rrule'`, which in Node gets rrule's CommonJS build without named exports; `vitest.config.ts` inlines the plugin so Vite resolves rrule's ES build, as the app's bundle does. The tests render `@fullcalendar/react`'s component with React and read `getApi().getEvents()`.
