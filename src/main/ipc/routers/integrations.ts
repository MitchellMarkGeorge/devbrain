import { z } from 'zod';
import { AuthType, Provider, SourceType } from '@common/integrations';
import type { Workspace } from '@main/core';
import { ConnectInProgressError } from '@main/core/shared/errors';
import { IpcError } from '../errors';
import { wsProcedure } from '../procedures';
import { t } from '../trpc';
import { zId } from '../zod';

// The workspace's connections to Linear and Google: connecting, re-authenticating, switching them
// on and off, and disconnecting. What these return never holds credentials: core's Integration is
// the row and its sources only.

const byId = z.object({ id: zId('integration') });

// the source types to switch on; core's default, every type the provider supports, when left out
const zEnableSources = z.array(z.enum(SourceType)).optional();

const zConnect = z.discriminatedUnion('auth', [
  z.object({
    auth: z.literal(AuthType.API_KEY),
    provider: z.enum(Provider),
    apiKey: z.string(),
    enableSources: zEnableSources,
  }),
  z.object({
    auth: z.literal(AuthType.OAUTH),
    provider: z.enum(Provider),
    enableSources: zEnableSources,
  }),
]);

const zReconnect = z.discriminatedUnion('auth', [
  z.object({ auth: z.literal(AuthType.API_KEY), id: zId('integration'), apiKey: z.string() }),
  z.object({ auth: z.literal(AuthType.OAUTH), id: zId('integration') }),
]);

// The OAuth sign-in each workspace is waiting on, so cancelConnect can abort it. Core runs one at a
// time per workspace (ConnectInProgressError), so it needs no id.
const oauthFlows = new WeakMap<Workspace, AbortController>();

// Runs an OAuth connect or reconnect, keeping its AbortController until it settles. A flow
// cancelled through cancelConnect fails with `cancelled`, not core's AbortError.
async function runOAuthFlow<T>(
  workspace: Workspace,
  run: (signal: AbortSignal) => Promise<T>,
): Promise<T> {
  if (oauthFlows.has(workspace)) throw new ConnectInProgressError();
  const controller = new AbortController();
  oauthFlows.set(workspace, controller);
  try {
    return await run(controller.signal);
  } catch (error) {
    if (controller.signal.aborted && isAbortError(error)) {
      throw new IpcError('cancelled', 'The sign-in was cancelled');
    }
    throw error;
  } finally {
    oauthFlows.delete(workspace);
  }
}

// what an AbortController aborted without a reason rejects with
function isAbortError(error: unknown): boolean {
  return error instanceof Error && error.name === 'AbortError';
}

export const integrationsRouter = t.router({
  // every integration, oldest first, each with its sources
  list: wsProcedure.query(({ ctx }) => ctx.workspace.integrations.list()),

  get: wsProcedure
    .input(byId)
    .query(({ ctx, input }) => ctx.workspace.integrations.getById(input.id)),

  // An API key resolves once the provider accepted it; OAuth once the browser flow has ended, or
  // fails with `cancelled` after cancelConnect. The first sync of the sources switched on runs
  // after the response, and reaches the renderer as `db.changes`.
  connect: wsProcedure.input(zConnect).mutation(({ ctx, input }) => {
    const { integrations } = ctx.workspace;
    if (input.auth === AuthType.API_KEY) {
      return integrations.connectWithApiKey(input.provider, input.apiKey, {
        enableSources: input.enableSources,
      });
    }
    return runOAuthFlow(ctx.workspace, (signal) =>
      integrations.connectWithOAuth(input.provider, { enableSources: input.enableSources, signal }),
    );
  }),

  // re-authenticates the same account, keeping the integration's sources and cursors
  reconnect: wsProcedure.input(zReconnect).mutation(({ ctx, input }) => {
    const { integrations } = ctx.workspace;
    if (input.auth === AuthType.API_KEY) {
      return integrations.reconnect(input.id, { type: AuthType.API_KEY, apiKey: input.apiKey });
    }
    return runOAuthFlow(ctx.workspace, (signal) =>
      integrations.reconnect(input.id, { type: AuthType.OAUTH, signal }),
    );
  }),

  // Aborts the OAuth sign-in this workspace is waiting on, whose call then fails with `cancelled`.
  // Returns whether there was one.
  cancelConnect: wsProcedure.mutation(({ ctx }): boolean => {
    const flow = oauthFlows.get(ctx.workspace);
    flow?.abort();
    return flow !== undefined;
  }),

  // disabling switches every source off; enabling switches back on those in `enableSources`, or all
  setEnabled: wsProcedure
    .input(
      z.object({ id: zId('integration'), enabled: z.boolean(), enableSources: zEnableSources }),
    )
    .mutation(({ ctx, input }) =>
      ctx.workspace.integrations.setEnabled(input.id, input.enabled, {
        enableSources: input.enableSources,
      }),
    ),

  // what disconnecting with "remove synced items" would delete and keep, for the dialog
  previewDisconnect: wsProcedure
    .input(byId)
    .query(({ ctx, input }) => ctx.workspace.integrations.previewDisconnect(input.id)),

  disconnect: wsProcedure
    .input(z.object({ id: zId('integration'), keepLocalCopies: z.boolean() }))
    .mutation(({ ctx, input }) =>
      ctx.workspace.integrations.disconnect(input.id, { keepLocalCopies: input.keepLocalCopies }),
    ),
});
