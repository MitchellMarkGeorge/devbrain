import type { CalendarId, EventId } from '@common/ids';
import { EventKind, EventStatus, type Calendar, type Event } from '@common/types';

const CREATED = new Date('2026-09-01T12:00:00Z');

export const WORK: Calendar = {
  id: 'cal_work' as CalendarId,
  sourceId: null,
  externalId: null,
  name: 'Work',
  color: '#22c55e',
  timeZone: null,
  isPrimary: true,
  selected: true,
  visible: true,
  historyLoadedFrom: null,
  createdAt: CREATED,
  updatedAt: CREATED,
};

/** An event as core returns it, with the given fields over a timed one-off's defaults */
export function event(fields: Partial<Event> & Pick<Event, 'id' | 'startAt' | 'endAt'>): Event {
  return {
    calendarId: WORK.id,
    title: 'Standup',
    description: null,
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
    ...fields,
  };
}

export const id = (value: string) => value as EventId;

/** A timed series in a zone: its first occurrence's instants and rule */
export function timedSeries(
  name: string,
  startAt: string,
  minutes: number,
  timeZone: string,
  recurrenceRule: string,
  exdates: Date[] = [],
): Event {
  const start = new Date(startAt);
  return event({
    id: id(name),
    title: name,
    startAt: start,
    endAt: new Date(start.getTime() + minutes * 60_000),
    timeZone,
    recurrenceRule,
    exdates,
  });
}

/** An all-day series from its dates, the instants at local midnight as core stores them */
export function allDaySeries(
  name: string,
  startDate: string,
  endDate: string,
  recurrenceRule: string,
  exdates: Date[] = [],
): Event {
  return event({
    id: id(name),
    title: name,
    allDay: true,
    startDate,
    endDate,
    startAt: localMidnight(startDate),
    endAt: localMidnight(endDate),
    recurrenceRule,
    exdates,
  });
}

export function localMidnight(date: string): Date {
  const [y, m, d] = date.split('-').map(Number);
  return new Date(y, m - 1, d);
}
