import { logging, requireDevBrain, requireWorkspace } from './middleware';
import { t } from './trpc';

// What every route is built from, for a query or a mutation alike. Each logs the call; the
// DevBrain and workspace ones also fail with devbrain_unavailable when core did not start, and the
// workspace one with no_workspace_open while none is open.

export const publicProcedure = t.procedure.use(logging);

// ctx.devBrain is set
export const devBrainProcedure = publicProcedure.use(requireDevBrain);

// ctx.devBrain and ctx.workspace are set
export const wsProcedure = publicProcedure.use(requireWorkspace);
