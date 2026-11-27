import { z } from 'zod';
import { workspaceStateSchema, type WorkspaceInfo, type WorkspaceState } from '@common/types';
import type { DotPathValue, DotPaths } from '@main/core/settings/types';
import { wsProcedure } from '../procedures';
import { t } from '../trpc';
import { zPathUpdate } from '../zod';

// a dot path to one value of the workspace's state or a group of them ('calendar.showTasks',
// 'calendar'), with a value of its type
type StatePath = DotPaths<WorkspaceState>;
type StateUpdate = {
  [P in StatePath]: { path: P; value: DotPathValue<WorkspaceState, P> };
}[StatePath];

const stateUpdateSchema = zPathUpdate<StateUpdate>(workspaceStateSchema);

// What the open workspace does that belongs to no feature router.
export const workspaceRouter = t.router({
  // Opens a link in the system browser. Only http and https URLs are opened: core's
  // guardOpenExternal throws UnsafeUrlError (unsafe_url) for anything else, having opened nothing
  // (docs/security/untrusted-content.md)
  openUrl: wsProcedure
    .input(z.object({ url: z.string() }))
    .mutation(({ ctx, input }) => ctx.workspace.openUrl(input.url)),

  // Writes one value of the open workspace's state (what the app remembers for it, in its
  // manifest), leaving the others as they are, and returns the workspace: the workspace's
  // counterpart of settings.set. The value is checked against the path's part of core's schema.
  // Read it from workspaces.current (`state`).
  setState: wsProcedure
    .input(stateUpdateSchema)
    .mutation(
      ({ ctx, input: { path, value } }): WorkspaceInfo =>
        ctx.devBrain.workspaces.setState(ctx.workspace.info.id, path, value),
    ),

  // Shows the open workspace's folder (its database and note files) in the file manager. The path
  // is the workspace's own, never input
  showInFolder: wsProcedure.mutation(({ ctx }) => ctx.desktop.openFolder(ctx.workspace.info.path)),
});
