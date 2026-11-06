import { z } from 'zod';
import { type AppSettings, appSettingsSchema, lastPageSchema } from '@common/types';
import { devBrainProcedure } from '../procedures';
import { t } from '../trpc';

// The user's settings. The app's state beside them in the settings file is main's (the workspaces
// routes write lastWorkspaceId), but for the last page, which only the renderer knows.
export const settingsRouter = t.router({
  get: devBrainProcedure.query(({ ctx }): AppSettings => ctx.devBrain.settings.get('settings')),

  // replaces the settings with the ones given, checked against core's schema, and returns them
  update: devBrainProcedure.input(appSettingsSchema).mutation(({ ctx, input }): AppSettings => {
    ctx.devBrain.settings.set('settings', input);
    return ctx.devBrain.settings.get('settings');
  }),

  // The page the app was on, for "Reopen last page" (general.openToLastPage), or null. The initial
  // load context carries it too, so boot doesn't wait for this
  lastPage: devBrainProcedure.query(({ ctx }): string | null =>
    ctx.devBrain.settings.get('state.lastPage'),
  ),

  // Remembers the page the app is on: an /app path with its search params. A write to the app's
  // state emits no SettingsChange, so saving it refetches nothing
  setLastPage: devBrainProcedure
    .input(z.object({ href: lastPageSchema }))
    .mutation(({ ctx, input }): void => {
      ctx.devBrain.settings.set('state.lastPage', input.href);
    }),

  // Shows the data folder (the DevBrain folder that is open) in the file manager. The path is the
  // one DevBrain opened, never input, not even the devBrainPath setting the renderer can write
  showDataFolder: devBrainProcedure.mutation(({ ctx }) =>
    ctx.desktop.openFolder(ctx.devBrain.path),
  ),
});
