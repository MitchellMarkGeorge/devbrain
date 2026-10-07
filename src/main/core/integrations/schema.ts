import { z } from 'zod';

// JSON columns on external_sources and external_links. Validate on read: an unreadable cursor is
// treated as null, which triggers a fresh initial sync. Times are ISO strings, as JSON has no dates.

// a missing key reads as null, so metadata written by an older version still parses
const nullableString = () => z.string().nullable().default(null);

export const linearTaskCursorSchema = z.discriminatedUnion('mode', [
  z.object({
    mode: z.literal('initial'),
    after: z.string().nullable(), // Linear's page cursor
    maxUpdatedAt: z.iso.datetime().nullable(), // highest updatedAt seen so far
  }),
  z.object({
    mode: z.literal('incremental'),
    updatedSince: z.iso.datetime(), // already minus the cursor overlap
  }),
]);

export const googleEventCursorSchema = z.object({
  // keyed by calendarId
  calendars: z.record(
    z.string(),
    z.object({
      syncToken: z.string().nullable(), // null until the first full pass ends
      pageToken: z.string().nullable(), // resume point inside a pass
    }),
  ),
});

// nothing in v1
export const linearTaskConfigSchema = z.object({});

export const googleEventConfigSchema = z.object({
  calendarIds: z.array(z.string()),
});

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

export const eventResponseSchema = z.enum(['accepted', 'declined', 'tentative', 'needsAction']);

export const eventLinkMetadataSchema = z.object({
  calendarId: z.string(),
  timeZone: nullableString(),
  response: eventResponseSchema.nullable().default(null),
  recurringEventExternalId: nullableString(),
  originalStartAt: z.iso.datetime().nullable().default(null),
});
