import { z } from 'zod';

// JSON columns on external_links. Validate on read. Times are ISO strings, as JSON has no dates.
// The cursor and config JSON on external_sources belong to sync: see sync/task-cursor.ts and
// sync/event-cursor.ts.

// a missing key reads as null, so metadata written by an older version still parses
const nullableString = () => z.string().nullable().default(null);

// A flag in a task link's metadata, `true` when a disconnect detached the link (applyDisconnect in
// disconnect.ts), so connecting the same account again can offer to reattach those tasks and leave
// alone the ones the user detached. It is left out of taskLinkMetadataSchema on purpose: read and
// written with json_extract, json_set and json_remove only.
//
// Cleared:
// - explicitly, with json_remove, by DetachService: keepKeptLocal (Keep Local), and stopOffering
//   for tasks Reattach All refused for good (gone, or assigned to someone else);
// - by a reattach (SyncWriter.reattachTasks): the upsert writes the link's whole metadata from
//   taskLinkMetadataSchema, which drops it. A write that merged into the metadata instead would
//   keep it, and the task would be offered again.
export const KEPT_BY_DISCONNECT = 'keptByDisconnect';

// Task links may also carry KEPT_BY_DISCONNECT (above), which this schema leaves out.
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
