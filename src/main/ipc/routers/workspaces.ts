import { z } from 'zod';
import { hexColorSchema } from '@common/color';
import type { WorkspaceId } from '@common/ids';
import type { DevBrain, Workspace, WorkspaceEntry } from '@main/core';
import type { ChangeRecorder } from '../server';
import { devBrainProcedure } from '../procedures';
import { t } from '../trpc';
import { zId, zPage } from '../zod';

// The workspace registry. These return a workspace's WorkspaceInfo, never the Workspace itself.
// The registry announces nothing but `opened` and `closed` (which the ChangeRouter broadcasts as
// workspace.changed), so each mutation records `workspace`, before its first await: a call that
// fails part way may still have written the registry.

const byId = z.object({ id: zId('workspace') });

export const workspacesRouter = t.router({
  list: devBrainProcedure
    .input(zPage)
    .query(({ ctx, input }) => ctx.devBrain.workspaces.listAll(input)),

  // the open workspace, or null
  current: devBrainProcedure.query(({ ctx }) => ctx.devBrain.currentWorkspace?.info ?? null),

  // closes the open one first, if any
  open: devBrainProcedure
    .input(byId)
    .mutation(({ ctx, input }) =>
      opened(ctx, input.id, () => ctx.devBrain.workspaces.open(input.id)),
    ),

  switch: devBrainProcedure
    .input(byId)
    .mutation(({ ctx, input }) =>
      opened(ctx, input.id, () => ctx.devBrain.workspaces.switch(input.id)),
    ),

  // creates the workspace without opening it: open it next to use it
  create: devBrainProcedure
    .input(z.object({ name: z.string().trim().min(1), color: hexColorSchema }))
    .mutation(async ({ ctx, input }): Promise<WorkspaceEntry> => {
      ctx.changes.record('workspace');
      const workspace = await ctx.devBrain.workspaces.create(input);
      // core hands back the new workspace's database open; it isn't the current workspace
      await workspace.close();
      return workspace.info;
    }),

  // only the open workspace can be deleted (core's workspace_not_open otherwise)
  delete: devBrainProcedure.input(byId).mutation(async ({ ctx, input }): Promise<void> => {
    ctx.changes.record('workspace');
    await ctx.devBrain.workspaces.delete(input.id);
    if (ctx.devBrain.settings.get('state.lastWorkspaceId') === input.id) {
      ctx.devBrain.settings.set('state.lastWorkspaceId', null);
    }
  }),
});

// Opens a workspace and remembers it, so the app reopens it at the next start (startDevBrain)
async function opened(
  ctx: { devBrain: DevBrain; changes: ChangeRecorder },
  id: WorkspaceId,
  open: () => Promise<Workspace>,
): Promise<WorkspaceEntry> {
  // lastOpenedAt, and the open workspace's own rows: the renderer starts over on workspace.changed
  ctx.changes.record('workspace');
  const workspace = await open();
  // main's own state, which the renderer never reads, so not recorded
  ctx.devBrain.settings.set('state.lastWorkspaceId', id);
  return workspace.info;
}
