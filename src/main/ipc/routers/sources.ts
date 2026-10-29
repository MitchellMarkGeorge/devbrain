import { z } from 'zod';
import { wsProcedure } from '../procedures';
import { t } from '../trpc';
import { zId } from '../zod';

// An integration's sources, each the role it plays in the workspace (tasks, events). A source is
// listed with its integration (integrations.list) and its sync state (sync.status).

export const sourcesRouter = t.router({
  // A source of a disabled integration can't be switched on (core's integration_disabled):
  // enable the integration instead. Switching one on starts its sync, which reaches the renderer
  // as `db.changes`.
  setEnabled: wsProcedure
    .input(z.object({ id: zId('externalSource'), enabled: z.boolean() }))
    .mutation(({ ctx, input }) =>
      ctx.workspace.integrations.setSourceEnabled(input.id, input.enabled),
    ),
});
