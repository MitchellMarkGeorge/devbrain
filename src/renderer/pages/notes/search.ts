import { z } from 'zod';
import { optional, sortDirection, zPrefixedId } from '../../app/search';

// `/app/notes`
export const notesSearch = z.object({
  // default: list
  view: optional(z.enum(['list', 'card'])),
  // default: updatedAt ("Last edited")
  sort: optional(z.enum(['updatedAt', 'createdAt', 'title'])),
  dir: optional(sortDirection),
  project: optional(z.union([zPrefixedId('project'), z.literal('none')])),
  link: optional(z.enum(['event', 'task', 'none'])),
});

export type NotesSearch = z.infer<typeof notesSearch>;
