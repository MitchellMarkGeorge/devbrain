import { z } from 'zod';
import { hexColorSchema } from '@common/color';
import type { WorkspaceEntry } from '@main/core';
import { devBrainProcedure } from '../procedures';
import { t } from '../trpc';
import { zId, zPage } from '../zod';

// The workspace registry. These return a workspace's WorkspaceInfo, never the Workspace itself.

const byId = z.object({ id: zId('workspace') });

export const workspacesRouter = t.router({
  list: devBrainProcedure
    .input(zPage)
    .query(({ ctx, input }) => ctx.devBrain.workspaces.listAll(input)),

  // the open workspace, or null
  current: devBrainProcedure.query(({ ctx }) => ctx.devBrain.currentWorkspace?.info ?? null),

  // closes the open one first, if any, and remembers the new one, so the app reopens it at the next
  // start (openLastWorkspace)
  open: devBrainProcedure.input(byId).mutation(async ({ ctx, input }): Promise<WorkspaceEntry> => {
    const workspace = await ctx.devBrain.workspaces.open(input.id);
    // main's own state, which the renderer never reads, so not recorded
    ctx.devBrain.settings.set('state.lastWorkspaceId', input.id);
    return workspace.info;
  }),

  // creates the workspace without opening it: open it next to use it
  create: devBrainProcedure
    .input(z.object({ name: z.string().trim().min(1), color: hexColorSchema }))
    .mutation(({ ctx, input }): Promise<WorkspaceEntry> => ctx.devBrain.workspaces.create(input)),

  // only the open workspace can be deleted (core's workspace_not_open otherwise)
  delete: devBrainProcedure.input(byId).mutation(async ({ ctx, input }): Promise<void> => {
    await ctx.devBrain.workspaces.delete(input.id);
    if (ctx.devBrain.settings.get('state.lastWorkspaceId') === input.id) {
      ctx.devBrain.settings.set('state.lastWorkspaceId', null);
    }
  }),
});
