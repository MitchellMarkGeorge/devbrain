import type { CalendarId } from '@common/ids';

// The calendar every local event goes in unless another is chosen. Seeded by the migration that
// added calendars, which also moved every existing event into it.
export const DEFAULT_CALENDAR_ID = 'cal_default' as CalendarId;
