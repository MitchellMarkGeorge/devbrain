// @vitest-environment happy-dom
import { act, createElement, createRef } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, describe, expect, it } from 'vitest';
import FullCalendar, { type CalendarRef } from '@fullcalendar/react';
import timeGridPlugin from '@fullcalendar/react/timegrid';
import rrulePlugin from '@fullcalendar/rrule';
import type { Event } from '@common/types';
import { occurrencesBetween, toEventInput } from '../../calendar';
import { WORK, allDaySeries, event, id, localMidnight, timedSeries } from './fixtures';

// occurrencesBetween against FullCalendar's own expansion of toEventInput's output, in several
// system zones: they must draw every occurrence at the same instant, since an occurrence edit
// names one by its start. Also pins where they are drawn across DST changes, which is where core
// resolves local times (core/events/recurrence.ts): 9:00 stays 9:00, a skipped time moves forward
// by the change, and of a repeated one the first.

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const ZONES = ['America/Toronto', 'Europe/London', 'Asia/Tokyo', 'UTC'];

const originalTz = process.env.TZ;
afterEach(() => {
  if (originalTz === undefined) delete process.env.TZ;
  else process.env.TZ = originalTz;
});

/** FullCalendar's occurrences of the events over [start, end), as the week view expands them */
function fullCalendarExpands(events: Event[], start: Date, end: Date) {
  const el = document.createElement('div');
  document.body.append(el);
  const root = createRoot(el);
  const calendar = createRef<CalendarRef>();
  act(() =>
    root.render(
      createElement(FullCalendar, {
        ref: calendar,
        plugins: [timeGridPlugin, rrulePlugin],
        initialView: 'timeGrid',
        visibleRange: { start, end },
        events: events.map((e) => toEventInput(e, WORK)),
      }),
    ),
  );
  const out = calendar
    .current!.getApi()
    .getEvents()
    .filter((e) => e.start! < end && (e.end ?? e.start!) > start)
    .map((e) => ({ id: e.id, start: e.start!.toISOString(), end: e.end?.toISOString() }));
  act(() => root.unmount());
  el.remove();
  return out.sort((a, b) => a.start.localeCompare(b.start) || a.id.localeCompare(b.id));
}

function occurrences(events: Event[], start: Date, end: Date) {
  return events
    .flatMap((e) => occurrencesBetween(e, start, end))
    .map((o) => ({ id: o.event.id, start: o.start.toISOString(), end: o.end.toISOString() }))
    .sort((a, b) => a.start.localeCompare(b.start) || a.id.localeCompare(b.id));
}

const starts = (list: { start: string }[]) => list.map((o) => o.start);

interface Case {
  name: string;
  events: () => Event[];
  range: [string, string];
  /** the starts expected, as instants; omitted where the comparison alone is the test */
  expected?: string[];
  /** compare ends too: all-day ends are dates; a timed end FullCalendar adds in local time */
  ends?: boolean;
}

const CASES: Case[] = [
  {
    name: "the spec's standup: Mon, Tue and Thu from the rule, Wed moved, Fri cancelled",
    events: () => {
      const master = timedSeries(
        'standup',
        '2026-10-05T13:00:00Z',
        15,
        'America/Toronto',
        'RRULE:FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR',
        [new Date('2026-10-07T13:00:00Z'), new Date('2026-10-09T13:00:00Z')],
      );
      const moved = event({
        id: id('standup_oct7'),
        startAt: new Date('2026-10-07T14:00:00Z'),
        endAt: new Date('2026-10-07T14:15:00Z'),
        seriesId: master.id,
        originalStartAt: new Date('2026-10-07T13:00:00Z'),
      });
      return [master, moved];
    },
    range: ['2026-10-05T00:00:00Z', '2026-10-12T12:00:00Z'],
    expected: [
      '2026-10-05T13:00:00.000Z',
      '2026-10-06T13:00:00.000Z',
      '2026-10-07T14:00:00.000Z',
      '2026-10-08T13:00:00.000Z',
    ],
    ends: true,
  },
  {
    name: 'a 9:00 series stays at 9:00 across the change to standard time, EXDATEs on both sides',
    events: () => [
      timedSeries(
        'dst',
        '2026-10-26T13:00:00Z',
        15,
        'America/Toronto',
        'RRULE:FREQ=DAILY;COUNT=10',
        [new Date('2026-10-28T13:00:00Z'), new Date('2026-11-03T14:00:00Z')],
      ),
    ],
    range: ['2026-10-25T12:00:00Z', '2026-11-08T12:00:00Z'],
    expected: [
      '2026-10-26T13:00:00.000Z',
      '2026-10-27T13:00:00.000Z',
      '2026-10-29T13:00:00.000Z',
      '2026-10-30T13:00:00.000Z',
      '2026-10-31T13:00:00.000Z',
      '2026-11-01T14:00:00.000Z',
      '2026-11-02T14:00:00.000Z',
      '2026-11-04T14:00:00.000Z',
    ],
  },
  {
    name: 'a 2:30 series on the night 2:00 jumps to 3:00 is drawn at 3:30',
    events: () => [
      timedSeries(
        'skip',
        '2026-03-06T07:30:00Z',
        30,
        'America/Toronto',
        'RRULE:FREQ=DAILY;COUNT=4',
      ),
    ],
    range: ['2026-03-05T12:00:00Z', '2026-03-10T12:00:00Z'],
    expected: [
      '2026-03-06T07:30:00.000Z',
      '2026-03-07T07:30:00.000Z',
      '2026-03-08T07:30:00.000Z', // 3:30 EDT
      '2026-03-09T06:30:00.000Z',
    ],
  },
  {
    name: 'a 1:30 series on the night 1:00 to 2:00 repeats is drawn at the first 1:30',
    events: () => [
      timedSeries(
        'repeat',
        '2026-10-30T05:30:00Z',
        30,
        'America/Toronto',
        'RRULE:FREQ=DAILY;COUNT=4',
      ),
    ],
    range: ['2026-10-29T12:00:00Z', '2026-11-03T12:00:00Z'],
    expected: [
      '2026-10-30T05:30:00.000Z',
      '2026-10-31T05:30:00.000Z',
      '2026-11-01T05:30:00.000Z', // 1:30 EDT
      '2026-11-02T06:30:00.000Z',
    ],
  },
  {
    name: "a provider's UTC UNTIL is an instant, and UTC and other-zone EXDATEs exclude",
    events: () => [
      timedSeries(
        'google',
        '2026-10-26T13:00:00Z',
        30,
        'America/Toronto',
        [
          // the last occurrence starts at 14:00Z on 1 November; 2 November's is a second late
          'RRULE:FREQ=DAILY;UNTIL=20261102T135959Z',
          'EXDATE:20261027T130000Z',
          'EXDATE;TZID=Europe/London:20261029T130000',
        ].join('\n'),
      ),
    ],
    range: ['2026-10-25T12:00:00Z', '2026-11-08T12:00:00Z'],
    expected: [
      '2026-10-26T13:00:00.000Z',
      '2026-10-28T13:00:00.000Z',
      '2026-10-30T13:00:00.000Z',
      '2026-10-31T13:00:00.000Z',
      '2026-11-01T14:00:00.000Z',
    ],
  },
  {
    name: 'RDATE adds, EXRULE removes, and two RRULEs both make occurrences',
    events: () => [
      timedSeries(
        'lines',
        '2026-10-26T13:00:00Z',
        15,
        'America/Toronto',
        [
          'RRULE:FREQ=WEEKLY;BYDAY=MO;COUNT=3',
          'RRULE:FREQ=WEEKLY;BYDAY=WE;COUNT=2',
          'RDATE;TZID=America/Toronto:20261030T090000',
          'EXRULE:FREQ=WEEKLY;INTERVAL=2;BYDAY=MO',
        ].join('\n'),
      ),
    ],
    range: ['2026-10-25T12:00:00Z', '2026-11-15T12:00:00Z'],
    expected: [
      '2026-10-28T13:00:00.000Z',
      '2026-10-30T13:00:00.000Z',
      '2026-11-02T14:00:00.000Z',
      '2026-11-04T14:00:00.000Z',
    ],
  },
  {
    name: 'a series whose zone is not the system’s keeps its own local time',
    events: () => [
      timedSeries('tokyo', '2026-10-26T00:00:00Z', 60, 'Asia/Tokyo', 'RRULE:FREQ=DAILY;COUNT=3'),
    ],
    range: ['2026-10-25T00:00:00Z', '2026-10-30T00:00:00Z'],
    expected: ['2026-10-26T00:00:00.000Z', '2026-10-27T00:00:00.000Z', '2026-10-28T00:00:00.000Z'],
  },
  {
    name: 'an all-day series by its dates, with an EXDATE, an RDATE and an exdate',
    events: () => [
      allDaySeries(
        'allday',
        '2026-10-26',
        '2026-10-28',
        'RRULE:FREQ=WEEKLY;BYDAY=MO,TH;COUNT=6\nEXDATE;VALUE=DATE:20261029\nRDATE;VALUE=DATE:20261031',
        [localMidnight('2026-11-05')],
      ),
    ],
    range: ['2026-10-25T12:00:00Z', '2026-11-20T12:00:00Z'],
    ends: true,
  },
];

describe('occurrencesBetween', () => {
  for (const zone of ZONES) {
    describe(`with the system in ${zone}`, () => {
      for (const c of CASES) {
        it(c.name, () => {
          process.env.TZ = zone;
          const events = c.events();
          const start = new Date(c.range[0]);
          const end = new Date(c.range[1]);
          const ours = occurrences(events, start, end);
          const theirs = fullCalendarExpands(events, start, end);
          expect(starts(ours)).toEqual(starts(theirs));
          if (c.ends) expect(ours).toEqual(theirs);
          if (c.expected) expect(starts(ours)).toEqual(c.expected);
        });
      }

      it('starts an all-day occurrence at local midnight of its date, for its length in days', () => {
        process.env.TZ = zone;
        const [series] = CASES.at(-1)!.events();
        const list = occurrencesBetween(
          series,
          localMidnight('2026-10-25'),
          localMidnight('2026-11-14'),
        );
        expect(list.map((o) => [o.start, o.end])).toEqual(
          [
            ['2026-10-26', '2026-10-28'],
            ['2026-10-31', '2026-11-02'],
            ['2026-11-02', '2026-11-04'],
            ['2026-11-09', '2026-11-11'],
            ['2026-11-12', '2026-11-14'],
          ].map(([a, b]) => [localMidnight(a), localMidnight(b)]),
        );
      });
    });
  }

  it('returns a one-off event when it overlaps the range, and nothing otherwise', () => {
    const one = event({
      id: id('one'),
      startAt: new Date('2026-10-05T13:00:00Z'),
      endAt: new Date('2026-10-05T14:00:00Z'),
    });
    expect(
      occurrencesBetween(one, new Date('2026-10-05T13:30:00Z'), new Date('2026-10-06T00:00:00Z')),
    ).toEqual([{ event: one, start: one.startAt, end: one.endAt }]);
    expect(
      occurrencesBetween(one, new Date('2026-10-05T14:00:00Z'), new Date('2026-10-06T00:00:00Z')),
    ).toEqual([]);
  });

  it('lists only the occurrences overlapping the range, including one that started before it', () => {
    const series = timedSeries(
      'long',
      '2026-10-05T13:00:00Z',
      120,
      'America/Toronto',
      'RRULE:FREQ=DAILY',
    );
    const list = occurrencesBetween(
      series,
      new Date('2026-10-07T14:00:00Z'),
      new Date('2026-10-08T14:00:00Z'),
    );
    expect(list.map((o) => o.start.toISOString())).toEqual([
      '2026-10-07T13:00:00.000Z',
      '2026-10-08T13:00:00.000Z',
    ]);
  });

  it('treats a series rrule cannot read as its first occurrence', () => {
    const series = timedSeries(
      'bad',
      '2026-10-05T13:00:00Z',
      30,
      'America/Toronto',
      'RRULE:FREQ=DAILY;BYDAY=XX',
    );
    expect(
      occurrencesBetween(
        series,
        new Date('2026-10-01T00:00:00Z'),
        new Date('2026-10-31T00:00:00Z'),
      ),
    ).toEqual([{ event: series, start: series.startAt, end: series.endAt }]);
  });
});
