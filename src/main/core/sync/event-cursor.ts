import { z } from 'zod';

// What an events source stores as its cursor on external_sources. Owned by EventSyncer; validated
// on read, and an unreadable cursor is treated as none, which gives every calendar a full pass. An
// events source stores no config: what it syncs is the calendars selected in the calendars table.

// one calendar's progress
export const calendarSyncStateSchema = z.object({
  // the source's change token from the end of the calendar's last pass; null until its first full
  // pass ends. Named for Google's sync token, which it was first, and kept so stored cursors parse
  syncToken: z.string().nullable(),
  pageToken: z.string().nullable(), // resume point inside a pass
  // the lower bound of a full pass, kept while it pages so every page asks the same question
  timeMin: z.iso.datetime().optional(),
  // a full pass's id, kept with timeMin while it pages: each page records what it listed under it
  // (external_full_pass_listed), and the last page removes what no page listed. Absent on a pass
  // started before passes had one, which then removes nothing
  pass: z.string().optional(),
});

export const eventCursorSchema = z.object({
  // each calendar's progress, keyed by the provider's calendar id
  calendars: z.record(z.string(), calendarSyncStateSchema),
  // the calendars a run has still to visit, in order; absent between runs
  pending: z.array(z.string()).optional(),
});

export type CalendarSyncState = z.infer<typeof calendarSyncStateSchema>;
export type EventCursor = z.infer<typeof eventCursorSchema>;
