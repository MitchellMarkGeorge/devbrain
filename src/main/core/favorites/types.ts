import type { StampedEntity, StampedEntityType, StampedId } from '../shared/stamped';

export type FavoritableId = StampedId;

export type FavoritableEntityType = StampedEntityType;

export interface FavoritesFilterOptions {
  /** restrict the list to one kind of entity (defaults to 'all') */
  entityType?: FavoritableEntityType | 'all';
}

/**
 * A single row in the favorites view. A lightweight summary rather than the full row, as in the
 * archive view: the four tables share only these columns, so this is what a UNION across them can
 * carry. Callers that need the whole entity can follow up with the owning service's getByIds.
 */
export type FavoritedEntity = StampedEntity<'favoritedAt'>;
