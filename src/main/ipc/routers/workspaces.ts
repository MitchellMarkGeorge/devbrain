import { z } from 'zod';
import { hexColorSchema } from '@common/color';
import type { WorkspaceInfo } from '@common/types';
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

  // closes the open one first, if any, and remembers the new one, so main reopens it at the next
  // start (openLastWorkspace). Every window follows it through `workspace.changed`, the one that
  // asked too; a failure shows from there as well, unless the id is unknown (nothing changed)
  open: devBrainProcedure.input(byId).mutation(async ({ ctx, input }): Promise<WorkspaceInfo> => {
    const workspace = await ctx.devBrain.workspaces.open(input.id);
    // main's own state, which the renderer never reads
    ctx.devBrain.settings.set('state.lastWorkspaceId', input.id);
    return workspace.info;
  }),

  // creates the workspace without opening it: open it next to use it
  create: devBrainProcedure
    .input(z.object({ name: z.string().trim().min(1), color: hexColorSchema }))
    .mutation(({ ctx, input }): Promise<WorkspaceInfo> => ctx.devBrain.workspaces.create(input)),

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
      ({ ctx, input: { id, ...options } }): Promise<WorkspaceInfo> =>
        ctx.devBrain.workspaces.update(id, options),
    ),

  // "Open folder…": asks for a folder with the system dialog, then adds that workspace folder
  // (copied into the DevBrain folder) without opening it: open it next to use it. Null when the
  // dialog was cancelled. The path comes from main's own dialog, never from the renderer. Core's
  // workspace_import (with a `reason`), workspace_too_new and workspace_migration say why one
  // can't be added.
  importFolder: devBrainProcedure.mutation(async ({ ctx }): Promise<WorkspaceInfo | null> => {
    const folder = await ctx.desktop.chooseFolder({
      title: 'Open Workspace Folder',
      buttonLabel: 'Open',
    });
    return folder === null ? null : ctx.devBrain.workspaces.import(folder);
  }),

  // only the open workspace can be deleted (core's workspace_not_open otherwise)
  delete: devBrainProcedure.input(byId).mutation(async ({ ctx, input }): Promise<void> => {
    await ctx.devBrain.workspaces.delete(input.id);
    if (ctx.devBrain.settings.get('state.lastWorkspaceId') === input.id) {
      ctx.devBrain.settings.set('state.lastWorkspaceId', null);
    }
  }),
});
