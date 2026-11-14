import { z } from 'zod';

// The settings page's search param (docs/renderer/implementation-plan.md, "/app/settings"): the
// section shown, snake case. A bad value falls back to General rather than failing the page.

export const SETTINGS_TABS = ['general', 'tasks', 'calendar', 'data_storage'] as const;
export type SettingsTab = (typeof SETTINGS_TABS)[number];

export const settingsSearchSchema = z.object({
  tab: z.enum(SETTINGS_TABS).optional().catch(undefined),
});

export type SettingsSearch = z.infer<typeof settingsSearchSchema>;
