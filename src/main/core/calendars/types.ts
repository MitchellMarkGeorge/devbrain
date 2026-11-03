import { CalendarId, ExternalSourceId } from '@common/ids';

// The calendar every local event goes in unless another is chosen. Seeded by the migration that
// added calendars, which also moved every existing event into it.
export const DEFAULT_CALENDAR_ID = 'cal_default' as CalendarId;

// A calendar events belong to: local (no sourceId), or synced from a provider. The calendar view
// shows each as one FullCalendar event source with its own colour.
export interface Calendar {
  id: CalendarId;
  // null for a local calendar
  sourceId: ExternalSourceId | null;
  // the provider's calendar id
  externalId: string | null;
  name: string;
  color: string | null;
  timeZone: string | null;
  // the account's own calendar
  isPrimary: boolean;
  // synced at all; always true for a local calendar
  selected: boolean;
  // shown in the calendar view
  visible: boolean;
  // how far back a synced calendar's events have been fetched; null for the default window alone
  historyLoadedFrom: Date | null;
  createdAt: Date;
  updatedAt: Date;
}
