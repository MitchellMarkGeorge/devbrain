import { z } from 'zod';
import { type AppSettings, appSettingsSchema, type SettingsFile } from '@common/types';
import type { DotPathValue, DotPaths } from '@main/core/settings/types';
import { devBrainProcedure } from '../procedures';
import { t } from '../trpc';

// The user's settings. The app's state beside them in the settings file is main's alone (the
// workspaces routes write lastWorkspaceId, runtime/last-page.ts the last page).

// a dot path to one setting or a group of them, under `settings`: 'settings.general.timeFormat',
// 'settings.calendar'
type SettingPath = Extract<DotPaths<SettingsFile>, `settings.${string}`>;

// a path with a value of its type
type SettingUpdate = {
  [P in SettingPath]: { path: P; value: DotPathValue<SettingsFile, P> };
}[SettingPath];

// every path under `settings`, each with its part of core's schema
function settingSchemas(
  schema: z.ZodObject = appSettingsSchema,
  prefix = 'settings',
): [string, z.ZodType][] {
  return Object.entries(schema.shape).flatMap(([key, part]) => {
    const path = `${prefix}.${key}`;
    const entry: [string, z.ZodType] = [path, part];
    return part instanceof z.ZodObject ? [entry, ...settingSchemas(part, path)] : [entry];
  });
}

const [first, ...rest] = settingSchemas().map(([path, value]) =>
  z.object({ path: z.literal(path), value }),
);
// the path picks the schema the value is checked against; a path outside `settings` is refused
const settingUpdateSchema = z.discriminatedUnion('path', [first, ...rest]) as unknown as z.ZodType<
  SettingUpdate,
  SettingUpdate
>;

export const settingsRouter = t.router({
  get: devBrainProcedure.query(({ ctx }): AppSettings => ctx.devBrain.settings.get('settings')),

  // Replaces the settings with the ones given, checked against core's schema, and returns them.
  // Two quick edits can race here, each sending every setting; prefer `set`.
  update: devBrainProcedure.input(appSettingsSchema).mutation(({ ctx, input }): AppSettings => {
    ctx.devBrain.settings.set('settings', input);
    return ctx.devBrain.settings.get('settings');
  }),

  // Writes one setting, or one group of them ('settings.calendar'), leaving the others as they
  // are, and returns every setting. The value is checked against the path's part of core's schema.
  set: devBrainProcedure
    .input(settingUpdateSchema)
    .mutation(({ ctx, input: { path, value } }): AppSettings => {
      ctx.devBrain.settings.set(path, value);
      return ctx.devBrain.settings.get('settings');
    }),

  // puts every setting back to its default and returns them; the app's state is kept
  reset: devBrainProcedure.mutation(({ ctx }): AppSettings => {
    ctx.devBrain.settings.reset();
    return ctx.devBrain.settings.get('settings');
  }),

  // Shows the data folder (the DevBrain folder that is open) in the file manager. The path is the
  // one DevBrain opened, never input, not even the devBrainPath setting the renderer can write
  showDataFolder: devBrainProcedure.mutation(({ ctx }) =>
    ctx.desktop.openFolder(ctx.devBrain.path),
  ),
});
