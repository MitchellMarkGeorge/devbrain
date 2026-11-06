import { z } from 'zod';
import { optional } from '../../app/search';

// `/app/trash`. Core sorts the trash one way, newest first.
export const trashSearch = z.object({
  tab: optional(z.enum(['all', 'projects', 'tasks', 'notes'])),
  sort: optional(z.enum(['trashed'])),
});

export type TrashSearch = z.infer<typeof trashSearch>;
