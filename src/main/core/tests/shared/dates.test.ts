import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import {
  allDayDates,
  fromDateString,
  isTimeZone,
  localDayWindow,
  localTimeZone,
  timeZoneSchema,
  toDateString,
} from '../../shared/dates';
import { EventService, timing } from '../../events/service';
import { TaskService } from '../../tasks/service';
import { TaskStatus } from '../../tasks/types';
import { DEFAULT_CALENDAR_ID } from '../../calendars/types';
import { createDb } from '../utils';

// The time zone policy (shared/dates.ts): dates and day ranges are days in the system zone. Each
// suite sets TZ, which Node applies to Date at once, and checks the helpers and the services built
// on them, across DST changes and in zones where midnight itself is skipped.

const HOUR = 60 * 60 * 1000;
const originalTz = process.env.TZ;

function inTimeZone(tz: string) {
  beforeAll(() => {
    process.env.TZ = tz;
  });
  afterAll(() => {
    if (originalTz === undefined) delete process.env.TZ;
    else process.env.TZ = originalTz;
  });
}

// every date of a year, as YYYY-MM-DD
function datesOf(year: number): string[] {
  const dates: string[] = [];
  for (let at = Date.UTC(year, 0, 1); new Date(at).getUTCFullYear() === year; at += 24 * HOUR) {
    dates.push(new Date(at).toISOString().slice(0, 10));
  }
  return dates;
}

function nextDate(date: string): string {
  const [year, month, day] = date.split('-').map(Number);
  return new Date(Date.UTC(year, month - 1, day + 1)).toISOString().slice(0, 10);
}

const ZONES = [
  'UTC',
  'America/Toronto', // DST at 2:00
  'Europe/London', // DST at 1:00, offset 0 in winter
  'Australia/Lord_Howe', // half-hour DST
  'America/Santiago', // DST at midnight: some days start at 1:00
  'America/Havana', // DST at midnight, northern hemisphere
  'Asia/Tokyo', // no DST
  'Pacific/Kiritimati', // UTC+14
  'Pacific/Pago_Pago', // UTC-11
];

describe.each(ZONES)('dates in %s', (tz) => {
  inTimeZone(tz);

  it('reports the zone as the system zone', () => {
    expect(localTimeZone()).toBe(tz);
  });

  it('round-trips every date of the year, a leap day included', () => {
    for (const date of [...datesOf(2026), '2028-02-29']) {
      const start = fromDateString(date);
      expect(toDateString(start), date).toBe(date);
      // the first moment of the day: a moment before is the day before
      expect(toDateString(new Date(start.getTime() - 1)), date).not.toBe(date);
    }
  });

  it("gives every day of the year a window from its start to the next day's", () => {
    for (const date of datesOf(2026)) {
      const [year, month, day] = date.split('-').map(Number);
      const { startOfDay, endOfDay } = localDayWindow(new Date(year, month - 1, day, 12));
      expect(startOfDay, date).toEqual(fromDateString(date));
      expect(endOfDay, date).toEqual(fromDateString(nextDate(date)));
      expect(toDateString(new Date(endOfDay.getTime() - 1)), date).toBe(date);
      // 23, 23.5, 24, 24.5 or 25 hours
      const hours = (endOfDay.getTime() - startOfDay.getTime()) / HOUR;
      expect([23, 23.5, 24, 24.5, 25], date).toContain(hours);
    }
  });

  it('gives the same window for any instant of the day, its first and last included', () => {
    const { startOfDay, endOfDay } = localDayWindow(new Date(2026, 6, 1, 12));
    expect(localDayWindow(startOfDay)).toEqual({ startOfDay, endOfDay });
    expect(localDayWindow(new Date(endOfDay.getTime() - 1))).toEqual({ startOfDay, endOfDay });
    expect(localDayWindow(endOfDay).startOfDay).toEqual(endOfDay);
  });

  it('turns all-day instants into dates on every day of the year', () => {
    for (const date of datesOf(2026)) {
      const start = fromDateString(date);
      const end = fromDateString(nextDate(date));
      // a whole day
      expect(allDayDates(start, end), date).toEqual({ startDate: date, endDate: nextDate(date) });
      // one instant of it: still the whole day
      expect(allDayDates(start, start), date).toEqual({ startDate: date, endDate: nextDate(date) });
    }
  });

  it("stores an all-day event's dates as given, at the starts of those days", () => {
    for (const date of datesOf(2026)) {
      const columns = timing({
        startAt: new Date(0),
        endAt: new Date(0),
        allDay: true,
        startDate: date,
        endDate: nextDate(date),
      });
      expect(columns, date).toEqual({
        startAt: fromDateString(date),
        endAt: fromDateString(nextDate(date)),
        allDay: true,
        startDate: date,
        endDate: nextDate(date),
      });
    }
  });
});

// days a DST change shortens or lengthens, checked against the instants they start and end at
const TRANSITIONS: { tz: string; date: string; start: string; end: string; hours: number }[] = [
  // spring forward at 2:00
  {
    tz: 'America/Toronto',
    date: '2026-03-08',
    start: '2026-03-08T05:00:00.000Z',
    end: '2026-03-09T04:00:00.000Z',
    hours: 23,
  },
  // fall back at 2:00: 1:00 to 2:00 happens twice
  {
    tz: 'America/Toronto',
    date: '2026-11-01',
    start: '2026-11-01T04:00:00.000Z',
    end: '2026-11-02T05:00:00.000Z',
    hours: 25,
  },
  {
    tz: 'Europe/London',
    date: '2026-03-29',
    start: '2026-03-29T00:00:00.000Z',
    end: '2026-03-29T23:00:00.000Z',
    hours: 23,
  },
  {
    tz: 'Europe/London',
    date: '2026-10-25',
    start: '2026-10-24T23:00:00.000Z',
    end: '2026-10-26T00:00:00.000Z',
    hours: 25,
  },
  {
    tz: 'Australia/Lord_Howe',
    date: '2026-10-04',
    start: '2026-10-03T13:30:00.000Z',
    end: '2026-10-04T13:00:00.000Z',
    hours: 23.5,
  },
  // midnight is skipped: the day starts at 1:00
  {
    tz: 'America/Santiago',
    date: '2026-09-06',
    start: '2026-09-06T04:00:00.000Z',
    end: '2026-09-07T03:00:00.000Z',
    hours: 23,
  },
  // 23:00 to midnight happens twice, so the next day starts after the second
  {
    tz: 'America/Santiago',
    date: '2026-04-04',
    start: '2026-04-04T03:00:00.000Z',
    end: '2026-04-05T04:00:00.000Z',
    hours: 25,
  },
];

describe.each(TRANSITIONS)('a DST change: $date in $tz', ({ tz, date, start, end, hours }) => {
  inTimeZone(tz);

  it('starts and ends the day at the right instants', () => {
    const window = localDayWindow(new Date(start));
    expect(window.startOfDay.toISOString()).toBe(start);
    expect(window.endOfDay.toISOString()).toBe(end);
    expect((window.endOfDay.getTime() - window.startOfDay.getTime()) / HOUR).toBe(hours);
    expect(fromDateString(date).toISOString()).toBe(start);
    expect(fromDateString(nextDate(date)).toISOString()).toBe(end);
  });

  it('puts every instant of the day on that date, and none outside it', () => {
    for (let at = Date.parse(start); at < Date.parse(end); at += HOUR / 4) {
      expect(toDateString(new Date(at)), new Date(at).toISOString()).toBe(date);
    }
    expect(toDateString(new Date(Date.parse(start) - 1))).not.toBe(date);
    expect(toDateString(new Date(end))).toBe(nextDate(date));
  });

  it('gives an all-day event of that day its own date', () => {
    expect(allDayDates(new Date(start), new Date(end))).toEqual({
      startDate: date,
      endDate: nextDate(date),
    });
  });

  it("filters tasks due on the day by the day's own length", async () => {
    const tasks = new TaskService(createDb());
    const due = async (title: string, at: number) =>
      tasks.createTask({ title, dueDate: new Date(at), status: TaskStatus.NOT_STARTED }).id;
    const first = await due('first moment', Date.parse(start));
    // the last whole second, as due dates are stored to the second
    const last = await due('last moment', Date.parse(end) - 1000);
    await due('day before', Date.parse(start) - 1000);
    await due('day after', Date.parse(end));

    const dueOn = tasks.listTasks({ dueOn: new Date(Date.parse(start) + HOUR) });
    expect(dueOn.items.map((task) => task.id).sort()).toEqual([first, last].sort());
  });

  it("stores an all-day event at the starts of its days and finds it in the day's range", async () => {
    const events = new EventService(createDb());
    const event = events.createEvent({
      title: 'All day',
      startAt: new Date(start),
      endAt: new Date(start),
      allDay: true,
      calendarId: DEFAULT_CALENDAR_ID,
    });
    expect(event).toMatchObject({ startDate: date, endDate: nextDate(date) });
    expect(event.startAt.toISOString()).toBe(start);
    expect(event.endAt.toISOString()).toBe(end);

    const { startOfDay, endOfDay } = localDayWindow(new Date(start));
    const inDay = events.listForCalendar(startOfDay, new Date(endOfDay.getTime() - 1));
    expect(inDay.map((found) => found.id)).toEqual([event.id]);
  });
});

describe('timeZoneSchema', () => {
  it('accepts IANA zone names', () => {
    for (const tz of [...ZONES, 'America/Argentina/Buenos_Aires', 'Etc/GMT+5']) {
      expect(isTimeZone(tz), tz).toBe(true);
    }
  });

  it('refuses what is not one', () => {
    for (const value of ['Toronto UTC', 'Mars/Olympus_Mons', '', '+05:00', '-0300', 'EST5EDT ']) {
      expect(isTimeZone(value), value).toBe(false);
    }
    expect(timeZoneSchema.safeParse('Toronto UTC').error?.issues[0].message).toBe(
      'Not an IANA time zone',
    );
  });
});

describe('EventService — time zones', () => {
  it("creates a local event in the system zone, or in the IANA zone it's given", async () => {
    const events = new EventService(createDb());
    const startAt = new Date('2026-10-05T14:00:00.000Z');
    const options = { title: 'Standup', startAt, endAt: startAt };
    expect(events.createEvent(options).timeZone).toBe(localTimeZone());
    const inTokyo = events.createEvent({ ...options, timeZone: 'Asia/Tokyo' });
    expect(inTokyo.timeZone).toBe('Asia/Tokyo');
    expect(events.updateEvent(inTokyo.id, { timeZone: 'UTC' }).timeZone).toBe('UTC');
  });

  it('refuses a zone that is not an IANA name, and writes nothing', async () => {
    const events = new EventService(createDb());
    const startAt = new Date('2026-10-05T14:00:00.000Z');
    const options = { title: 'Standup', startAt, endAt: startAt };
    expect(() => events.createEvent({ ...options, timeZone: 'Toronto UTC' })).toThrow(
      expect.objectContaining({
        code: 'invalid_input',
        message: 'Not an IANA time zone: Toronto UTC',
      }),
    );
    const event = events.createEvent(options);
    expect(() => events.updateEvent(event.id, { timeZone: '+05:00' })).toThrow(
      'Not an IANA time zone',
    );
    expect(events.getById(event.id).timeZone).toBe(localTimeZone());
  });
});
