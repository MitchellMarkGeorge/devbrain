import { z } from 'zod';
import { workspaceSettingsSchema, type WorkspaceInfo, type WorkspaceSettings } from '@common/types';
import type { DotPathValue, DotPaths } from '@main/core/settings/types';
import { wsProcedure } from '../procedures';
import { t } from '../trpc';
import { zPathUpdate } from '../zod';

// a dot path to one of the workspace's own settings or a group of them ('calendar.showTasks',
// 'calendar'), with a value of its type
type SettingPath = DotPaths<WorkspaceSettings>;
type SettingUpdate = {
  [P in SettingPath]: { path: P; value: DotPathValue<WorkspaceSettings, P> };
}[SettingPath];

const settingUpdateSchema = zPathUpdate<SettingUpdate>(workspaceSettingsSchema);

// What the open workspace does that belongs to no feature router.
export const workspaceRouter = t.router({
  // Opens a link in the system browser. Only http and https URLs are opened: core's
  // guardOpenExternal throws UnsafeUrlError (unsafe_url) for anything else, having opened nothing
  // (docs/security/untrusted-content.md)
  openUrl: wsProcedure
    .input(z.object({ url: z.string() }))
    .mutation(({ ctx, input }) => ctx.workspace.openUrl(input.url)),

  // Writes one of the open workspace's own settings (in its manifest), leaving the others as they
  // are, and returns the workspace: the workspace's counterpart of settings.set. The value is
  // checked against the path's part of core's schema. Read them from workspaces.current
  // (`settings`).
  setSetting: wsProcedure
    .input(settingUpdateSchema)
    .mutation(
      ({ ctx, input: { path, value } }): WorkspaceInfo =>
        ctx.devBrain.workspaces.setSetting(ctx.workspace.info.id, path, value),
    ),

  // Shows the open workspace's folder (its database and note files) in the file manager. The path
  // is the workspace's own, never input
  showInFolder: wsProcedure.mutation(({ ctx }) => ctx.desktop.openFolder(ctx.workspace.info.path)),
});
