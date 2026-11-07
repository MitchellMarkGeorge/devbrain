import { z } from 'zod';
import { optional, sortDirection } from '../../app/search';

// `/app/projects`
export const projectsSearch = z.object({
  view: optional(z.enum(['list', 'card'])),
  // default: active
  status: optional(z.enum(['active', 'all', 'not_started', 'on_hold', 'completed'])),
  // default: dueDate
  sort: optional(z.enum(['dueDate', 'createdAt', 'updatedAt', 'status'])),
  dir: optional(sortDirection),
  source: optional(z.enum(['local', 'external'])),
});

// `/app/projects/$projectId`
export const projectSearch = z.object({
  // default: overview
  tab: optional(z.enum(['overview', 'tasks', 'notes'])),
});

export type ProjectsSearch = z.infer<typeof projectsSearch>;
export type ProjectSearch = z.infer<typeof projectSearch>;
