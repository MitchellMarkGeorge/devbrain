import { IpcError, serializeTRPCError } from './errors';
import { t } from './trpc';

// The middleware every route runs through its base procedure (procedures.ts).

// path, duration and, on failure, the error code: never the input, which may be a note's content
// or an API key
export const logging = t.middleware(async ({ ctx, path, type, next }) => {
  const started = performance.now();
  const result = await next();
  const took = `${Math.round(performance.now() - started)}ms`;
  if (result.ok) ctx.log.debug(`${type} ${path} ${took}`);
  else ctx.log.warn(`${type} ${path} ${took} error=${serializeTRPCError(result.error).code}`);
  return result;
});

// only the app's own page may call main: not a frame some other page managed to load
export const senderGuard = t.middleware(({ ctx, next }) => {
  if (!ctx.appPages.includes(ctx.event.senderFrame?.url)) {
    throw new IpcError('internal', "This page can't call DevBrain");
  }
  return next();
});

export const requireDevBrain = t.middleware(({ ctx, next }) => {
  const { devBrain } = ctx;
  if (devBrain === null) throw devBrainUnavailable();
  return next({ ctx: { devBrain } });
});

export const requireWorkspace = t.middleware(({ ctx, next }) => {
  const { devBrain, workspace } = ctx;
  if (devBrain === null) throw devBrainUnavailable();
  if (workspace === null) throw new IpcError('no_workspace_open', 'Open a workspace first');
  return next({ ctx: { devBrain, workspace } });
});

function devBrainUnavailable(): IpcError {
  return new IpcError('devbrain_unavailable', 'DevBrain could not start');
}
