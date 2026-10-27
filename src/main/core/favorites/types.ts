import type { EventId, NoteId, ProjectId, TaskId } from '@common/ids';

export type FavoritableId = TaskId | ProjectId | NoteId | EventId;

export type FavoritableEntityType = 'tasks' | 'projects' | 'notes' | 'events';

export interface FavoritesFilterOptions {
  /** restrict the list to one kind of entity (defaults to 'all') */
  entityType?: FavoritableEntityType | 'all';
}

/**
 * A single row in the favorites view. A lightweight summary rather than the full row, as in the
 * archive view: the four tables share only these columns, so this is what a UNION across them can
 * carry. Callers that need the whole entity can follow up with the owning service's getByIds.
 */
export interface FavoritedEntity {
  id: FavoritableId;
  entityType: FavoritableEntityType;
  title: string;
  favoritedAt: Date;
}
