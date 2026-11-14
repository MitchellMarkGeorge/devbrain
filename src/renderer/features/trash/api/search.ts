import { z } from 'zod';
import type { ArchivableEntityType } from '@common/types';

// The trash page's search params (docs/renderer/implementation-plan.md, "/app/trash"): which kind
// of item it lists, and its sort. Each is `.optional().catch(undefined)`: a bad value falls back to
// the default (every kind, newest first) rather than failing the page.

export const TRASH_TABS = ['all', 'projects', 'tasks', 'notes'] as const;
export type TrashTab = (typeof TRASH_TABS)[number];

export const trashSearchSchema = z.object({
  tab: z.enum(TRASH_TABS).optional().catch(undefined),
  /** core lists the trash one way, most recently trashed first; the param keeps room for more */
  sort: z.enum(['trashed']).optional().catch(undefined),
});

export type TrashSearch = z.infer<typeof trashSearchSchema>;

/** What `archive.listArchived` takes for a tab. */
export function trashEntityType(tab: TrashTab | undefined): ArchivableEntityType | 'all' {
  return tab ?? 'all';
}
