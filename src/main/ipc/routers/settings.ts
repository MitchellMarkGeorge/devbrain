import type { AppSettings } from '@main/core';
import { appSettingsSchema } from '@main/core/settings/schema';
import { devBrainProcedure } from '../procedures';
import { t } from '../trpc';

// The user's settings. The app's state beside them in the settings file is main's alone (the
// workspaces routes write lastWorkspaceId).
export const settingsRouter = t.router({
  get: devBrainProcedure.query(({ ctx }): AppSettings => ctx.devBrain.settings.get('settings')),

  // replaces the settings with the ones given, checked against core's schema, and returns them
  update: devBrainProcedure.input(appSettingsSchema).mutation(({ ctx, input }): AppSettings => {
    ctx.devBrain.settings.set('settings', input);
    return ctx.devBrain.settings.get('settings');
  }),

  // Shows the data folder (the DevBrain folder that is open) in the file manager. The path is the
  // one DevBrain opened, never input, not even the devBrainPath setting the renderer can write
  showDataFolder: devBrainProcedure.mutation(({ ctx }) =>
    ctx.desktop.openFolder(ctx.devBrain.path),
  ),
});
