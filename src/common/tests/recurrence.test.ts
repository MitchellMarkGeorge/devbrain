import { afterEach, describe, expect, it } from 'vitest';
import {
  hasOccurrenceBefore,
  isOccurrenceStart,
  occurrenceStarts,
  seriesRule,
  type SeriesTiming,
} from '../recurrence';

// The shared reading and expansion of a series' rule. Core's occurrence edits and the renderer's
// calendar both rest on it (their own tests cover them: core/tests/events/occurrences.test.ts, and
// renderer/tests/calendar/recurrence.test.ts against FullCalendar); these pin the reading itself,
// under several system zones, since a series' zone and the system's are independent.

const ZONES = ['America/Toronto', 'Europe/London', 'Asia/Tokyo', 'UTC'];

const originalTz = process.env.TZ;
afterEach(() => {
  if (originalTz === undefined) delete process.env.TZ;
  else process.env.TZ = originalTz;
});

const iso = (dates: Date[]) => dates.map((date) => date.toISOString());

// a 9:00 Toronto series from Monday 26 October 2026 (EDT, 13:00Z); DST ends on 1 November
const toronto: SeriesTiming = {
  startAt: new Date('2026-10-26T13:00:00Z'),
  allDay: false,
  startDate: null,
  timeZone: 'America/Toronto',
};

function localMidnight(date: string): Date {
  const [y, m, d] = date.split('-').map(Number);
  return new Date(y, m - 1, d);
}

for (const zone of ZONES) {
  describe(`with the system in ${zone}`, () => {
    it('reads RDATE and EXDATE values as the instants they name, whatever their form', () => {
      process.env.TZ = zone;
      const rule = seriesRule(
        toronto,
        [
          'DTSTART:20200101T000000Z',
          'RRULE:FREQ=DAILY',
          'EXDATE:20261027T130000Z',
          'EXDATE;TZID=Europe/London:20261028T130000,20261029T130000',
          'EXDATE:20261030T090000',
          'RDATE;TZID=Asia/Tokyo:20261101T090000',
          'EXDATE:not-a-date',
        ].join('\n'),
      );
      // the provider's DTSTART is dropped, the start is startAt in its zone
      expect(rule.start.toISOString()).toBe('2026-10-26T09:00:00.000Z');
      expect(iso(rule.exdates)).toEqual([
        '2026-10-27T13:00:00.000Z', // UTC
        '2026-10-28T13:00:00.000Z', // London (GMT) 13:00 is 9:00 Toronto (EDT)
        '2026-10-29T13:00:00.000Z',
        '2026-10-30T13:00:00.000Z', // floating: 9:00 in the series' zone
      ]);
      expect(iso(rule.rdates)).toEqual(['2026-11-01T00:00:00.000Z']);
    });

    it('stays at 9:00 local across DST, less its exclusions, plus its RDATEs', () => {
      process.env.TZ = zone;
      const rule = seriesRule(
        toronto,
        'RRULE:FREQ=DAILY;COUNT=8\nEXDATE:20261027T130000Z\nRDATE:20261103T150000Z',
        [new Date('2026-10-30T13:00:00Z')],
      );
      expect(
        iso(
          occurrenceStarts(
            rule,
            new Date('2026-10-25T00:00:00Z'),
            new Date('2026-11-10T00:00:00Z'),
          ),
        ),
      ).toEqual([
        '2026-10-26T13:00:00.000Z',
        '2026-10-28T13:00:00.000Z',
        '2026-10-29T13:00:00.000Z',
        '2026-10-31T13:00:00.000Z',
        '2026-11-01T14:00:00.000Z', // EST from here
        '2026-11-02T14:00:00.000Z', // the eighth, the last the COUNT makes
        '2026-11-03T15:00:00.000Z', // the RDATE
      ]);
    });

    it('reads a UTC UNTIL as an instant, west and east of UTC', () => {
      process.env.TZ = zone;
      // west: 12:59:59Z on 30 October is 8:59:59 in Toronto, so the 30th's 9:00 is after it
      const west = seriesRule(toronto, 'RRULE:FREQ=DAILY;UNTIL=20261030T125959Z');
      expect(
        iso(
          occurrenceStarts(
            west,
            new Date('2026-10-29T00:00:00Z'),
            new Date('2026-11-02T00:00:00Z'),
          ),
        ),
      ).toEqual(['2026-10-29T13:00:00.000Z']);
      // east: 00:00Z on 28 October is 9:00 in Tokyo, the last occurrence
      const tokyo = {
        ...toronto,
        startAt: new Date('2026-10-26T00:00:00Z'),
        timeZone: 'Asia/Tokyo',
      };
      const east = seriesRule(tokyo, 'RRULE:FREQ=DAILY;UNTIL=20261028T000000Z');
      expect(
        iso(
          occurrenceStarts(
            east,
            new Date('2026-10-25T00:00:00Z'),
            new Date('2026-11-02T00:00:00Z'),
          ),
        ),
      ).toEqual([
        '2026-10-26T00:00:00.000Z',
        '2026-10-27T00:00:00.000Z',
        '2026-10-28T00:00:00.000Z',
      ]);
    });

    it('expands an all-day series by its dates, each from the local midnight of its date', () => {
      process.env.TZ = zone;
      const allDay: SeriesTiming = {
        startAt: localMidnight('2026-10-26'),
        allDay: true,
        startDate: '2026-10-26',
        timeZone: null,
      };
      const rule = seriesRule(
        allDay,
        'RRULE:FREQ=WEEKLY;BYDAY=MO,TH;UNTIL=20261109T000000Z\nEXDATE;VALUE=DATE:20261029\nRDATE:20261031T120000Z',
      );
      expect(
        occurrenceStarts(rule, localMidnight('2026-10-25'), localMidnight('2026-11-20')),
      ).toEqual(
        ['2026-10-26', '2026-10-31', '2026-11-02', '2026-11-05', '2026-11-09'].map(localMidnight),
      );
      expect(isOccurrenceStart(rule, localMidnight('2026-11-02'))).toBe(true);
      // an all-day occurrence starts at midnight, nowhere else on its day
      expect(
        isOccurrenceStart(rule, new Date(localMidnight('2026-11-02').getTime() + 3600_000)),
      ).toBe(false);
    });

    it('recognises an occurrence start to the millisecond, as an occurrence ref names it', () => {
      process.env.TZ = zone;
      const rule = seriesRule(toronto, 'RRULE:FREQ=DAILY');
      expect(isOccurrenceStart(rule, new Date('2026-11-02T14:00:00Z'))).toBe(true);
      expect(isOccurrenceStart(rule, new Date('2026-11-02T13:00:00Z'))).toBe(false);
      expect(isOccurrenceStart(rule, new Date('2026-11-02T14:00:00.500Z'))).toBe(false);
    });

    it('knows the first occurrence when the rule skips the start’s day', () => {
      process.env.TZ = zone;
      // created on Monday 26 October, repeating on Wednesdays: the first is the 28th
      const rule = seriesRule(toronto, 'RRULE:FREQ=WEEKLY;BYDAY=WE');
      expect(hasOccurrenceBefore(rule, new Date('2026-10-28T13:00:00Z'))).toBe(false);
      expect(hasOccurrenceBefore(rule, new Date('2026-11-04T14:00:00Z'))).toBe(true);
    });
  });
}
