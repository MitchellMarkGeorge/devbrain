import { CalendarId, EventId, generateId } from '@common/ids';
import {
  sqliteTable,
  text,
  index,
  check,
  primaryKey,
  AnySQLiteColumn,
} from 'drizzle-orm/sqlite-core';
import { isNotNull, sql } from 'drizzle-orm';
import { EventKind, EventResponse, EventStatus } from '../../core/events/types';
import { timesamps, date, boolean } from './utils';
import { DEFAULT_CALENDAR_ID } from '../../core/calendars/types';
import { calendars } from './calendars';

export const events = sqliteTable(
  'events',
  {
    id: text()
      .primaryKey()
      .$type<EventId>()
      .$default(() => generateId('event')),
    calendarId: text()
      .notNull()
      .$type<CalendarId>()
      .default(DEFAULT_CALENDAR_ID)
      .references(() => calendars.id),
    title: text().notNull(),
    description: text(),
    startAt: date().notNull(),
    endAt: date().notNull(),
    allDay: boolean().notNull().default(false),
    // an all-day event's dates, YYYY-MM-DD with the end exclusive; startAt and endAt are their local
    // midnights
    startDate: text(),
    endDate: text(),
    timeZone: text(), // IANA zone; a series expands in it
    location: text(),
    // RFC 5545 lines joined with \n, as the source wrote them; no DTSTART
    recurrenceRule: text(),
    // a moved or edited occurrence of a series. Set null when the series goes, so an occurrence a
    // note links to survives as a one-off
    seriesId: text()
      .$type<EventId>()
      .references((): AnySQLiteColumn => events.id, { onDelete: 'set null' }),
    originalStartAt: date(),
    status: text().notNull().$type<EventStatus>().default(EventStatus.CONFIRMED),
    response: text().$type<EventResponse>(),
    kind: text().notNull().$type<EventKind>().default(EventKind.DEFAULT),
    meetingUrl: text(),
    color: text(), // overrides the calendar's colour
    ...timesamps,
  },
  (table) => [
    // used a lot for calendar views (Month, Week, Day): EventService.listForCalendar filters and
    // orders by startAt, then id
    index('idx_events_start_at_id').on(table.startAt, table.id),
    index('idx_events_calendar_id').on(table.calendarId),
    // a series' occurrences, for its exdates
    index('idx_events_series_id').on(table.seriesId).where(isNotNull(table.seriesId)),
    // an all-day event has its dates, and only an all-day event does
    check(
      'all_day_dates',
      sql`(${table.allDay} = 1 AND ${table.startDate} IS NOT NULL AND ${table.endDate} IS NOT NULL) OR (${table.allDay} = 0 AND ${table.startDate} IS NULL AND ${table.endDate} IS NULL)`,
    ),
    // an occurrence of a series says which start it replaces
    check(
      'series_original_start',
      sql`${table.seriesId} IS NULL OR ${table.originalStartAt} IS NOT NULL`,
    ),
  ],
);

// The cancelled occurrences of a series, by the start each had. With the original starts of the
// series' own occurrence rows, they are what the series no longer has: FullCalendar's exdate.
export const eventExceptions = sqliteTable(
  'event_exceptions',
  {
    seriesId: text()
      .notNull()
      .$type<EventId>()
      .references((): AnySQLiteColumn => events.id, { onDelete: 'cascade' }),
    originalStartAt: date().notNull(),
  },
  (table) => [primaryKey({ columns: [table.seriesId, table.originalStartAt] })],
);
