import { IpcError } from './errors';
import { t } from './trpc';

// The middleware every route runs through its base procedure (procedures.ts).

// every call's path and duration, never its input, which may be a note's content or an API key.
// A failure's code is logged by attachRouter's onError (src/main/index.ts), from the error the
// response carries
export const logging = t.middleware(async ({ ctx, path, type, next }) => {
  const started = performance.now();
  const result = await next();
  const took = `${Math.round(performance.now() - started)}ms`;
  ctx.log.debug(`${type} ${path} ${took}${result.ok ? '' : ' failed'}`);
  return result;
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
