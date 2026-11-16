import { z } from 'zod';

// Each settings section is a page of its own (/settings/general, /settings/tasks, …). Before that,
// one page showed them in ?tab, which an older link (a saved last page) may still carry: /settings
// sends it to its section. A bad value falls back to General.

export const SETTINGS_SECTIONS = [
  'general',
  'integrations',
  'import-export',
  'preferences',
  'tasks',
  'calendar',
  'data-storage',
] as const;
export type SettingsSection = (typeof SETTINGS_SECTIONS)[number];

const LEGACY_TABS = ['general', 'tasks', 'calendar', 'data_storage'] as const;
type LegacyTab = (typeof LEGACY_TABS)[number];

export const legacySettingsSearchSchema = z.object({
  tab: z.enum(LEGACY_TABS).optional().catch(undefined),
});

/** The section an older `?tab` named (General, which held the preferences too, for none). */
export function sectionOfLegacyTab(tab: LegacyTab | undefined): SettingsSection {
  return tab === undefined ? 'general' : tab === 'data_storage' ? 'data-storage' : tab;
}
