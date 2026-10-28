import { z } from 'zod';
import type { DevBrain } from '@main/core';
import { appSettingsSchema, appStateSchema } from '@main/core/settings/schema';
import type { SettingsFile } from '@main/core/settings/types';
import { devBrainMutation, devBrainQuery } from '../procedures';
import { t } from '../trpc';

// The settings file. SettingsService announces nothing, so update records `settings`.

const { general, tasks, calendar } = appSettingsSchema.shape;

// any part of the settings, each value checked against core's schema; an unknown key is refused.
// Of the state, only the last page is the renderer's to write: main keeps lastWorkspaceId
export const settingsPatchSchema = z.strictObject({
  settings: appSettingsSchema
    .extend({
      general: general.strict().partial(),
      tasks: tasks.strict().partial(),
      calendar: calendar.strict().partial(),
    })
    .strict()
    .partial()
    .optional(),
  state: appStateSchema.pick({ lastPage: true }).strict().partial().optional(),
});

export type SettingsPatch = z.infer<typeof settingsPatchSchema>;

export const settingsRouter = t.router({
  get: devBrainQuery.query(({ ctx }) => readSettings(ctx.devBrain)),

  // writes each value the patch carries, and returns the whole file as it now is
  update: devBrainMutation.input(settingsPatchSchema).mutation(({ ctx, input }) => {
    ctx.changes.record('settings');
    for (const [key, value] of leaves(input)) setPath(ctx.devBrain, key, value);
    return readSettings(ctx.devBrain);
  }),
});

function readSettings(devBrain: DevBrain): SettingsFile {
  return { settings: devBrain.settings.get('settings'), state: devBrain.settings.get('state') };
}

// the patch as dot paths to the values it sets, e.g. ['settings.general.timeFormat', '24']
function leaves(value: object, prefix = ''): [string, unknown][] {
  return Object.entries(value).flatMap(([key, child]): [string, unknown][] => {
    if (child === undefined) return [];
    const path = prefix === '' ? key : `${prefix}.${key}`;
    return isPlainObject(child) ? leaves(child, path) : [[path, child]];
  });
}

function isPlainObject(value: unknown): value is object {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

// the path and value came through settingsPatchSchema, so they match the settings' types
function setPath(devBrain: DevBrain, path: string, value: unknown): void {
  devBrain.settings.set(path as 'settings', value as SettingsFile['settings']);
}
