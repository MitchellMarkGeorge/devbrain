import { z } from 'zod';
import { hexColorSchema } from '@common/color';
import type { WorkspaceEntry } from '@main/core';
import { openLastWorkspace } from '../../runtime/start';
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
    // main's own state, which the renderer never reads
    ctx.devBrain.settings.set('state.lastWorkspaceId', input.id);
    return workspace.info;
  }),

  // The renderer's first call once it has loaded: opens the workspace open last time while none is
  // open, and returns the open one, or null when there is none to open (the user picks one). A
  // reload or a second window gets the workspace already open, never reopened.
  openLast: devBrainProcedure.mutation(
    async ({ ctx }): Promise<WorkspaceEntry | null> =>
      (await openLastWorkspace(ctx.devBrain))?.info ?? null,
  ),

  // creates the workspace without opening it: open it next to use it
  create: devBrainProcedure
    .input(z.object({ name: z.string().trim().min(1), color: hexColorSchema }))
    .mutation(({ ctx, input }): Promise<WorkspaceEntry> => ctx.devBrain.workspaces.create(input)),

  // renames or recolours any workspace, open or not; a field left out keeps its value
  update: devBrainProcedure
    .input(
      z.object({
        id: zId('workspace'),
        name: z.string().trim().min(1).optional(),
        color: hexColorSchema.optional(),
      }),
    )
    .mutation(
      ({ ctx, input: { id, ...options } }): Promise<WorkspaceEntry> =>
        ctx.devBrain.workspaces.update(id, options),
    ),

  // only the open workspace can be deleted (core's workspace_not_open otherwise)
  delete: devBrainProcedure.input(byId).mutation(async ({ ctx, input }): Promise<void> => {
    await ctx.devBrain.workspaces.delete(input.id);
    if (ctx.devBrain.settings.get('state.lastWorkspaceId') === input.id) {
      ctx.devBrain.settings.set('state.lastWorkspaceId', null);
    }
  }),
});
