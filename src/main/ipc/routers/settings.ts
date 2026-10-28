import type { AppSettings } from '@main/core';
import { appSettingsSchema } from '@main/core/settings/schema';
import { devBrainProcedure } from '../procedures';
import { t } from '../trpc';

// The user's settings. The app's state beside them in the settings file is main's alone (the
// workspaces routes write lastWorkspaceId). SettingsService announces nothing, so update records
// `settings`.
export const settingsRouter = t.router({
  get: devBrainProcedure.query(({ ctx }): AppSettings => ctx.devBrain.settings.get('settings')),

  // replaces the settings with the ones given, checked against core's schema, and returns them
  update: devBrainProcedure.input(appSettingsSchema).mutation(({ ctx, input }): AppSettings => {
    ctx.changes.record('settings');
    ctx.devBrain.settings.set('settings', input);
    return ctx.devBrain.settings.get('settings');
  }),
});
