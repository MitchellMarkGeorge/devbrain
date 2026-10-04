import { EventId, generateId } from '@common/ids';
import { sqliteTable, text, index } from 'drizzle-orm/sqlite-core';
import { timesamps, date, boolean } from './utils';

export const events = sqliteTable(
  'events',
  {
    id: text()
      .primaryKey()
      .$type<EventId>()
      .$default(() => generateId('event')),
    title: text().notNull(),
    description: text(),
    // confirm these values
    startAt: date().notNull(),
    endAt: date().notNull(),
    allDay: boolean().notNull().default(false),
    location: text(),
    reccurrenceRule: text(),
    meetingUrl: text(),
    color: text(),
    ...timesamps,
  },
  (table) => [
    // used a lot for calendar views (Month, Week, Day), and for keyset pagination
    // in EventService.listEventsInRange (ordered by startAt, id)
    index('idx_events_start_at_id').on(table.startAt, table.id),
  ],
);
