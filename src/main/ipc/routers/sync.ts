import { z } from 'zod';
import { wsProcedure } from '../procedures';
import { t } from '../trpc';
import { zId } from '../zod';

// Syncing the workspace's sources on demand, and how each one's syncing goes. The status UI also
// follows the `sync.progress` and `sources.changed` events.

export const syncRouter = t.router({
  // "Sync now", for one source or every enabled one: always runs, with the reconcile pass.
  // Resolves once the runs have ended, so what they wrote comes back in `changed`; how each ended
  // is in sync.status.
  now: wsProcedure
    .input(z.object({ sourceId: zId('externalSource').optional() }).optional())
    .mutation(({ ctx, input }) => ctx.workspace.sync.syncNow(input?.sourceId)),

  // every source of every integration, with whether a run is in flight
  status: wsProcedure.query(({ ctx }) => ctx.workspace.sync.getStatus()),
});
