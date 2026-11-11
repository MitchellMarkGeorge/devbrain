import { useQuery } from '@tanstack/react-query';
import type { Event, Note, Project, SearchEntityType, Task } from '@common/types';
import { trpc } from '../../ipc';

/** A task, note, project or event, tagged with its type as the recents list tags them. */
export type EntityItem =
  | { entityType: 'tasks'; entity: Task }
  | { entityType: 'notes'; entity: Note }
  | { entityType: 'projects'; entity: Project }
  | { entityType: 'events'; entity: Event };

export interface AtRest {
  /** the group's label */
  label: string;
  /** how the rows are ordered: by last update, or (events) by last view */
  by: 'updated' | 'viewed';
  items: EntityItem[];
}

const LIMIT = 10;

/**
 * What ⌘K lists for a type filter while nothing is typed: the type's most recently updated tasks,
 * notes or projects, or its most recently viewed events (no route lists events by update).
 * Undefined while it loads, or when `type` is null (the "All" filter, or something is typed).
 */
export function useAtRest(type: SearchEntityType | null): AtRest | undefined {
  const sort = { sortBy: 'updatedAt' as const, direction: 'desc' as const };
  const tasks = useQuery({
    ...trpc.tasks.list.queryOptions({ sort, limit: LIMIT }),
    enabled: type === 'task',
  });
  const notes = useQuery({
    ...trpc.notes.list.queryOptions({ sort, limit: LIMIT }),
    enabled: type === 'note',
  });
  const projects = useQuery({
    ...trpc.projects.list.queryOptions({ sort, limit: LIMIT }),
    enabled: type === 'project',
  });
  const events = useQuery({
    ...trpc.recents.list.queryOptions({ entityType: 'events', limit: LIMIT }),
    enabled: type === 'event',
  });

  const updated = (items: EntityItem[] | undefined): AtRest | undefined =>
    items && { label: 'Recently updated', by: 'updated', items };
  switch (type) {
    case 'task':
      return updated(tasks.data?.items.map((entity) => ({ entityType: 'tasks', entity })));
    case 'note':
      return updated(notes.data?.items.map((entity) => ({ entityType: 'notes', entity })));
    case 'project':
      return updated(projects.data?.items.map((entity) => ({ entityType: 'projects', entity })));
    case 'event':
      return events.data && { label: 'Recent', by: 'viewed', items: events.data.items };
    default:
      return undefined;
  }
}
