import { z } from 'zod';

// Where a tasks source's last run stopped, stored on external_sources. Owned by TaskSyncer;
// validated on read, and an unreadable cursor is treated as none, which starts a fresh initial
// sync. Times are ISO strings, as JSON has no dates.

export const taskCursorSchema = z.discriminatedUnion('mode', [
  z.object({
    mode: z.literal('initial'),
    after: z.string().nullable(), // the source's page token
    maxUpdatedAt: z.iso.datetime().nullable(), // latest change seen so far
  }),
  z.object({
    mode: z.literal('incremental'),
    updatedSince: z.iso.datetime(), // already minus the cursor overlap
    // set only while a run walks more than one page of changes; updatedSince stays fixed meanwhile
    after: z.string().optional(),
    maxUpdatedAt: z.iso.datetime().optional(),
  }),
]);

export type TaskCursor = z.infer<typeof taskCursorSchema>;

// What the user chose to sync, stored as external_sources.config. Nothing in v1: every task
// assigned to the viewer is synced, so nothing parses it yet. A choice such as Linear teams or
// GitHub repositories would go here, and TaskSyncer would parse it when a run starts and pass it
// on in AssignedTasksQuery.
export const taskConfigSchema = z.object({});

export type TaskConfig = z.infer<typeof taskConfigSchema>;
