import { logging, requireDevBrain, requireWorkspace, senderGuard } from './middleware';
import { t } from './trpc';

// What every route is built from. Each logs the call and refuses a page that is not the app's own;
// the DevBrain and workspace ones also fail with devbrain_unavailable when core did not start, and
// the workspace ones with no_workspace_open while none is open. A query and a mutation share a
// builder: the names say which a route is.

const publicProcedure = t.procedure.use(logging).use(senderGuard);
export const publicQuery = publicProcedure;
export const publicMutation = publicProcedure;

// ctx.devBrain is set
const devBrainProcedure = publicProcedure.use(requireDevBrain);
export const devBrainQuery = devBrainProcedure;
export const devBrainMutation = devBrainProcedure;

// ctx.devBrain and ctx.workspace are set
const wsProcedure = publicProcedure.use(requireWorkspace);
export const wsQuery = wsProcedure;
export const wsMutation = wsProcedure;
