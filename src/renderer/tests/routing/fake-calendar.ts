import type { CalendarId, EventId } from '@common/ids';
import { EventKind, EventStatus, type Calendar, type Event } from '@common/types';

// The calendars and events a fake main's workspace holds, answering the calendar routes the
// calendar page calls as core does where the page can tell (visibility, the range, the calendar
// asked for), and recording the writes, which change the store simply (an occurrence edit makes a
// row; a delete removes the event).

const CREATED = new Date(2026, 5, 1, 9);

export function fakeCalendar(id: string, name: string, extra: Partial<Calendar> = {}): Calendar {
  return {
    id: id as CalendarId,
    sourceId: null,
    externalId: null,
    name,
    color: '#2b7fff',
    timeZone: null,
    isPrimary: false,
    selected: true,
    visible: true,
    historyLoadedFrom: null,
    createdAt: CREATED,
    updatedAt: CREATED,
    ...extra,
  };
}

/** A timed event as core returns it, on `calendarId`, an hour from `startAt`. */
export function fakeEvent(
  id: string,
  title: string,
  startAt: Date,
  extra: Partial<Event> = {},
): Event {
  return {
    id: id as EventId,
    calendarId: 'cal_work' as CalendarId,
    title,
    description: null,
    startAt,
    endAt: new Date(startAt.getTime() + 60 * 60_000),
    allDay: false,
    startDate: null,
    endDate: null,
    timeZone: null,
    location: null,
    recurrenceRule: null,
    seriesId: null,
    originalStartAt: null,
    status: EventStatus.CONFIRMED,
    response: null,
    kind: EventKind.DEFAULT,
    meetingUrl: null,
    color: null,
    exdates: [],
    external: null,
    createdAt: CREATED,
    updatedAt: CREATED,
    favoritedAt: null,
    viewedAt: null,
    ...extra,
  };
}

export class FakeCalendar {
  constructor(
    public calendars: Calendar[] = [],
    public events: Event[] = [],
  ) {}

  find(id: unknown): Event | undefined {
    return this.events.find((event) => event.id === id);
  }

  /** core's listForCalendar: the visible calendars' events that may occur in the range */
  listForCalendar(start: Date, end: Date, calendarIds?: string[]): Event[] {
    const visible = new Set(this.calendars.filter((c) => c.visible).map((c) => c.id));
    return this.events.filter(
      (event) =>
        visible.has(event.calendarId) &&
        (!calendarIds || calendarIds.includes(event.calendarId)) &&
        event.startAt < end &&
        (event.recurrenceRule !== null || event.endAt > start),
    );
  }

  setVisible(id: unknown, visible: boolean): Calendar {
    const calendar = this.calendars.find((c) => c.id === id);
    if (!calendar) throw new Error(`${String(id)} not found`);
    calendar.visible = visible;
    return calendar;
  }

  create(fields: Partial<Event> & { title: string; startAt: Date; endAt: Date }): Event {
    const event = fakeEvent(`evt_new${this.events.length + 1}`, fields.title, fields.startAt, {
      calendarId: this.calendars[0]?.id,
      ...fields,
    });
    this.events.push(event);
    return event;
  }

  update(id: unknown, fields: Partial<Event>): Event {
    const event = this.find(id);
    if (!event) throw new Error(`${String(id)} not found`);
    return Object.assign(event, fields, { updatedAt: new Date() });
  }

  /** "this": the occurrence's own row, made from the series; "following": a new series */
  updateOccurrence(
    seriesId: unknown,
    originalStartAt: Date,
    scope: 'this' | 'following',
    fields: Partial<Event>,
  ): Event {
    const series = this.find(seriesId);
    if (!series) throw new Error(`${String(seriesId)} not found`);
    const length = series.endAt.getTime() - series.startAt.getTime();
    const base = {
      ...series,
      startAt: originalStartAt,
      endAt: new Date(originalStartAt.getTime() + length),
    };
    const row: Event =
      scope === 'this'
        ? {
            ...base,
            id: `${series.id}_${originalStartAt.getTime()}` as EventId,
            recurrenceRule: null,
            seriesId: series.id,
            originalStartAt,
            exdates: [],
            ...fields,
          }
        : { ...base, id: `${series.id}_from${originalStartAt.getTime()}` as EventId, ...fields };
    series.exdates = [...(series.exdates ?? []), originalStartAt];
    this.events.push(row);
    return row;
  }

  delete(id: unknown): void {
    this.events = this.events.filter((event) => event.id !== id && event.seriesId !== id);
  }

  deleteOccurrence(seriesId: unknown, originalStartAt: Date): void {
    const series = this.find(seriesId);
    if (!series) throw new Error(`${String(seriesId)} not found`);
    series.exdates = [...(series.exdates ?? []), originalStartAt];
  }
}
