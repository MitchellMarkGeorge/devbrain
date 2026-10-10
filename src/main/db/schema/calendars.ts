import { CalendarId, ExternalSourceId, generateId } from '@common/ids';
import { sqliteTable, text, unique } from 'drizzle-orm/sqlite-core';
import { timesamps, boolean } from './utils';
import { externalSources } from './integrations';

// A calendar events belong to: a local one (no sourceId), or one synced from a provider, which the
// calendar view shows as one event source with its own colour.
export const calendars = sqliteTable(
  'calendars',
  {
    id: text()
      .primaryKey()
      .$type<CalendarId>()
      .$default(() => generateId('calendar')),
    // null for a local calendar; set null on disconnect, so kept events keep their calendar
    sourceId: text()
      .$type<ExternalSourceId>()
      .references(() => externalSources.id, { onDelete: 'set null' }),
    externalId: text(), // the provider's calendar id
    name: text().notNull(),
    color: text(),
    timeZone: text(), // IANA zone
    isPrimary: boolean().notNull().default(false), // the account's own calendar
    // synced at all; always true for a local calendar
    selected: boolean().notNull().default(true),
    // shown in the calendar view
    visible: boolean().notNull().default(true),
    updatedAt: timesamps.updatedAt,
    createdAt: timesamps.createdAt,
  },
  (table) => [unique('uq_calendars_source_external_id').on(table.sourceId, table.externalId)],
);
