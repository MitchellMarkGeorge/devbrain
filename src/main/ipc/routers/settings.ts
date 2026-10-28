import type { AppSettings, AppState } from '@main/core';
import { appSettingsSchema, appStateSchema } from '@main/core/settings/schema';
import { devBrainProcedure } from '../procedures';
import { t } from '../trpc';

// The settings file: the user's settings, and the app's state beside them. SettingsService
// announces nothing, so each update records `settings`.
export const settingsRouter = t.router({
  get: devBrainProcedure.query(({ ctx }): AppSettings => ctx.devBrain.settings.get('settings')),

  // replaces the settings with the ones given, checked against core's schema, and returns them
  update: devBrainProcedure.input(appSettingsSchema).mutation(({ ctx, input }): AppSettings => {
    ctx.changes.record('settings');
    ctx.devBrain.settings.set('settings', input);
    return ctx.devBrain.settings.get('settings');
  }),

  getState: devBrainProcedure.query(({ ctx }): AppState => ctx.devBrain.settings.get('state')),

  // the page the app was on, to reopen it at the next start. lastWorkspaceId is main's: the
  // workspaces routes write it
  updateState: devBrainProcedure
    .input(appStateSchema.pick({ lastPage: true }))
    .mutation(({ ctx, input }): AppState => {
      ctx.changes.record('settings');
      ctx.devBrain.settings.set('state.lastPage', input.lastPage);
      return ctx.devBrain.settings.get('state');
    }),
});
