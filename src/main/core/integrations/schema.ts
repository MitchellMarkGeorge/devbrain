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
    // set only while a run walks more than one page of changes; updatedSince stays fixed meanwhile
    after: z.string().optional(),
    maxUpdatedAt: z.iso.datetime().optional(),
  }),
]);

export const googleEventCursorSchema = z.object({
  // keyed by calendarId
  calendars: z.record(
    z.string(),
    z.object({
      syncToken: z.string().nullable(), // null until the first full pass ends
      pageToken: z.string().nullable(), // resume point inside a pass
      // the lower bound of a full pass, kept while it pages so every page asks the same question
      timeMin: z.iso.datetime().optional(),
    }),
  ),
  // the calendars a run has still to visit, in order; absent between runs
  pending: z.array(z.string()).optional(),
});

// Nothing in v1: every issue assigned to the viewer is synced. A team filter would go here; see
// the config parameter of TaskSource.pull.
export const linearTaskConfigSchema = z.object({});

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
