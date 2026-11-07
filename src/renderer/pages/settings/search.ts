import { z } from 'zod';
import { optional } from '../../app/search';

// `/app/settings`
export const settingsSearch = z.object({
  tab: optional(z.enum(['general', 'calendar', 'tasks', 'data_storage'])),
});

export type SettingsSearch = z.infer<typeof settingsSearch>;
