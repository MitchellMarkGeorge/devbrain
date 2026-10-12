import { z } from 'zod';

// JSON columns on external_links. Validate on read. Times are ISO strings, as JSON has no dates.
// The cursor and config JSON on external_sources belong to sync: see sync/task-cursor.ts and
// sync/event-cursor.ts.

// a missing key reads as null, so metadata written by an older version still parses
const nullableString = () => z.string().nullable().default(null);

export const taskLinkMetadataSchema = z.object({
  statusLabel: nullableString(),
  priorityLabel: nullableString(),
  parentExternalId: nullableString(),
  parentKey: nullableString(),
  parentTitle: nullableString(),
});

export const projectLinkMetadataSchema = z.object({
  statusLabel: nullableString(),
});

// Provider bookkeeping only: what the event shows (time zone, response, kind, its series) is in
// columns on events.
export const eventLinkMetadataSchema = z.object({
  // the provider's calendar id
  calendarId: z.string(),
  // on an occurrence of a series: the master's external id, which adopts the occurrence into its
  // series if the master arrives after it
  recurringEventExternalId: nullableString(),
});
