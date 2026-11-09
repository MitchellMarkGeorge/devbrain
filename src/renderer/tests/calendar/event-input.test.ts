import { afterEach, describe, expect, it } from 'vitest';
import { EventKind, EventResponse, EventStatus } from '@common/types';
import { toEventInput, toEventSource } from '../../calendar';
import { WORK, allDaySeries, event, id, timedSeries } from './fixtures';

// toEventInput against docs/calendar/fullcalendar-adapter.md, and the rewrites of provider lines
// that keep rrule.js and FullCalendar reading them as RFC 5545 means them.

const originalTz = process.env.TZ;
afterEach(() => {
  if (originalTz === undefined) delete process.env.TZ;
  else process.env.TZ = originalTz;
});

// no key FullCalendar would refine into "undefined"
function expectNoUndefined(input: object) {
  for (const [key, value] of Object.entries(input)) {
    expect(value, key).not.toBeUndefined();
  }
}

describe('toEventInput', () => {
  it("maps the spec's example: a standup with a moved and a cancelled occurrence", () => {
    // Mon 5 Oct to Fri 9 Oct 2026, 9:00 Toronto (EDT, 13:00Z); Wednesday's moved to 10:00
    const master = {
      ...timedSeries(
        'evt_standup',
        '2026-10-05T13:00:00Z',
        15,
        'America/Toronto',
        'RRULE:FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR',
        [new Date('2026-10-07T13:00:00Z'), new Date('2026-10-09T13:00:00Z')],
      ),
      title: 'Standup',
    };
    const moved = event({
      id: id('evt_standup_oct7'),
      startAt: new Date('2026-10-07T14:00:00Z'),
      endAt: new Date('2026-10-07T14:15:00Z'),
      seriesId: master.id,
      originalStartAt: new Date('2026-10-07T13:00:00Z'),
    });

    for (const tz of ['America/Toronto', 'Asia/Tokyo']) {
      process.env.TZ = tz;
      expect(toEventInput(master, WORK)).toMatchObject({
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
      });
    }
    expect(toEventInput(moved, WORK)).toMatchObject({
      id: 'evt_standup_oct7',
      groupId: 'evt_standup',
      title: 'Standup',
      start: new Date('2026-10-07T14:00:00Z'),
      end: new Date('2026-10-07T14:15:00Z'),
      allDay: false,
    });
    expect(toEventInput(moved, WORK).extendedProps).toMatchObject({
      seriesId: 'evt_standup',
      originalStartAt: new Date('2026-10-07T13:00:00Z'),
      recurring: false,
    });
    expectNoUndefined(toEventInput(master, WORK));
    expectNoUndefined(toEventInput(moved, WORK));
  });

  it('passes an all-day one-off’s dates through as text', () => {
    const holiday = event({
      id: id('evt_holiday'),
      title: 'Canada Day',
      allDay: true,
      startDate: '2026-07-01',
      endDate: '2026-07-02',
      startAt: new Date(2026, 6, 1),
      endAt: new Date(2026, 6, 2),
    });
    const input = toEventInput(holiday, WORK);
    expect(input).toMatchObject({
      id: 'evt_holiday',
      start: '2026-07-01',
      end: '2026-07-02',
      allDay: true,
    });
    // a one-off joins no group
    expect('groupId' in input).toBe(false);
    expectNoUndefined(input);
  });

  it('writes an all-day series with bare dates, which rrule reads, and its length in days', () => {
    const series = allDaySeries(
      'evt_offsite',
      '2026-10-05',
      '2026-10-07',
      'RRULE:FREQ=WEEKLY;COUNT=4\nEXDATE;VALUE=DATE:20261019',
      [new Date(2026, 9, 12)],
    );
    expect(toEventInput(series, WORK)).toMatchObject({
      rrule:
        'DTSTART:20261005\n' +
        'RRULE:FREQ=WEEKLY;COUNT=4\n' +
        'EXDATE:20261019\n' +
        'EXDATE:20261012',
      duration: { days: 2 },
      allDay: true,
    });
  });

  it("rewrites a provider's UTC and other-zone values as local times in the series' zone", () => {
    const series = timedSeries(
      'evt_sync',
      '2026-10-26T13:00:00Z',
      30,
      'America/Toronto',
      [
        'RRULE:FREQ=DAILY;UNTIL=20261102T135959Z',
        'EXDATE:20261028T130000Z',
        'EXDATE;TZID=Europe/London:20261029T130000,20261030T130000',
        'RDATE;TZID=America/Toronto:20261103T090000',
        'EXRULE:FREQ=WEEKLY;BYDAY=SA',
      ].join('\n'),
    );
    expect(toEventInput(series, WORK).rrule).toBe(
      [
        'DTSTART;TZID=America/Toronto:20261026T090000',
        // 13:59:59Z on 2 Nov is 8:59:59 in Toronto (EST)
        'RRULE:FREQ=DAILY;UNTIL=20261102T085959',
        'EXRULE:FREQ=WEEKLY;BYDAY=SA',
        'RDATE;TZID=America/Toronto:20261103T090000',
        'EXDATE;TZID=America/Toronto:20261028T090000',
        // 13:00 London (GMT after 25 Oct) is 9:00 Toronto (EDT)
        'EXDATE;TZID=America/Toronto:20261029T090000',
        'EXDATE;TZID=America/Toronto:20261030T090000',
      ].join('\n'),
    );
  });

  it("drops a provider's DTSTART, keeping the one from startAt", () => {
    const series = timedSeries(
      'evt_dtstart',
      '2026-10-05T13:00:00Z',
      30,
      'America/Toronto',
      'DTSTART:20200101T000000Z\nRRULE:FREQ=DAILY',
    );
    expect(toEventInput(series, WORK).rrule).toBe(
      'DTSTART;TZID=America/Toronto:20261005T090000\nRRULE:FREQ=DAILY',
    );
  });

  it('draws a series rrule cannot read as its first occurrence', () => {
    const series = timedSeries(
      'evt_bad',
      '2026-10-05T13:00:00Z',
      30,
      'America/Toronto',
      'RRULE:FREQ=DAILY;BYDAY=XX',
    );
    const input = toEventInput(series, WORK);
    expect(input).toMatchObject({ start: series.startAt, end: series.endAt });
    expect('rrule' in input).toBe(false);
  });

  it("sets color only when the event's own colour is valid and not the calendar's", () => {
    const at = { id: id('e'), startAt: new Date(), endAt: new Date() };
    expect(toEventInput(event({ ...at, color: '#ff0000' }), WORK).color).toBe('#ff0000');
    expect('color' in toEventInput(event({ ...at, color: '#22C55E' }), WORK)).toBe(false);
    expect('color' in toEventInput(event({ ...at, color: 'red;}' }), WORK)).toBe(false);
    expect('color' in toEventInput(event(at), WORK)).toBe(false);
  });

  it('makes a synced event read-only and leaves a local one to the calendar', () => {
    const at = { id: id('e'), startAt: new Date(), endAt: new Date() };
    const external = {
      provider: 'google',
      state: 'linked',
      key: null,
      url: 'https://calendar.google.com/event?eid=1',
      statusLabel: null,
      priorityLabel: null,
      lastSyncedAt: new Date(),
    } as never;
    expect(toEventInput(event({ ...at, external }), WORK).editable).toBe(false);
    expect('editable' in toEventInput(event(at), WORK)).toBe(false);
    // the URL travels in extendedProps, never as `url`, which FullCalendar would navigate to
    expect('url' in toEventInput(event({ ...at, external }), WORK)).toBe(false);
  });

  it('puts the display hints in extendedProps', () => {
    const at = { id: id('e'), startAt: new Date(), endAt: new Date() };
    expect(
      toEventInput(
        event({
          ...at,
          kind: EventKind.FOCUS_TIME,
          status: EventStatus.TENTATIVE,
          meetingUrl: 'https://meet.example.com/x',
        }),
        WORK,
      ).extendedProps,
    ).toMatchObject({ kind: 'focus', tentative: true, declined: false, meeting: true });
    expect(
      toEventInput(
        event({ ...at, kind: EventKind.OUT_OF_OFFICE, response: EventResponse.DECLINED }),
        WORK,
      ).extendedProps,
    ).toMatchObject({ kind: 'out-of-office', tentative: false, declined: true, meeting: false });
    expect(
      toEventInput(event({ ...at, response: EventResponse.TENTATIVE }), WORK).extendedProps,
    ).toMatchObject({ kind: 'event', tentative: true });
  });
});

describe('toEventSource', () => {
  it('colours the source by the calendar and maps what load returns', async () => {
    const one = event({ id: id('e'), startAt: new Date(), endAt: new Date() });
    const source = toEventSource(WORK, async () => [one]) as {
      id: string;
      color?: string;
      events: (info: object) => Promise<unknown[]>;
    };
    expect(source).toMatchObject({ id: 'cal_work', color: '#22c55e' });
    await expect(source.events({ start: new Date(), end: new Date() })).resolves.toEqual([
      toEventInput(one, WORK),
    ]);
    const unsafe = toEventSource({ ...WORK, color: 'url(x)' }, async () => []);
    expect('color' in (unsafe as object)).toBe(false);
  });
});
