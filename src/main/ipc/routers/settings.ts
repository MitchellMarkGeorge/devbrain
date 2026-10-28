import type { DevBrain } from '@main/core';
import { appSettingsSchema } from '@main/core/settings/schema';
import type { SettingsFile } from '@main/core/settings/types';
import { devBrainProcedure } from '../procedures';
import { t } from '../trpc';

// The settings file. SettingsService announces nothing, so update records `settings`.
export const settingsRouter = t.router({
  get: devBrainProcedure.query(({ ctx }) => readSettings(ctx.devBrain)),

  // replaces the settings with the ones given, checked against core's schema, and returns the file
  update: devBrainProcedure.input(appSettingsSchema).mutation(({ ctx, input }) => {
    ctx.changes.record('settings');
    ctx.devBrain.settings.set('settings', input);
    return readSettings(ctx.devBrain);
  }),
});

function readSettings(devBrain: DevBrain): SettingsFile {
  return { settings: devBrain.settings.get('settings'), state: devBrain.settings.get('state') };
}
