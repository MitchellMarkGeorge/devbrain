import { z } from 'zod';
import { optional, sortDirection, zPrefixedId } from '../../app/search';

// `/app/tasks` (see the renderer plan, Search params). Core filters status and priority by one
// value each; they can become arrays later without breaking URLs.
export const tasksSearch = z.object({
  // default: settings.tasks.defaultView
  view: optional(z.enum(['list', 'group', 'board'])),
  // the group view only
  groupBy: optional(z.enum(['project', 'status', 'priority', 'due'])),
  // default: settings.tasks.defaultSort
  sort: optional(z.enum(['priority', 'dueDate', 'status', 'createdAt', 'updatedAt'])),
  dir: optional(sortDirection),
  // default: open, or all when settings.tasks.showCompletedTasks is on
  status: optional(z.enum(['open', 'all', 'not_started', 'in_progress', 'completed', 'cancelled'])),
  priority: optional(z.enum(['low', 'medium', 'high'])),
  project: optional(z.union([zPrefixedId('project'), z.literal('none')])),
  due: optional(z.enum(['overdue', 'today', 'week', 'none'])),
  source: optional(z.enum(['local', 'external'])),
  // the task sheet over the board
  open: optional(zPrefixedId('task')),
});

export type TasksSearch = z.infer<typeof tasksSearch>;
