import type { StampedEntity, StampedEntityType, StampedId } from '../shared/stamped';

export type FavoritableId = StampedId;

export type FavoritableEntityType = StampedEntityType;

export interface FavoritesFilterOptions {
  /** restrict the list to one kind of entity (defaults to 'all') */
  entityType?: FavoritableEntityType | 'all';
}

/**
 * A single row in the favorites view: the whole entity under `entity`, as its service reads it, and
 * when it was favorited. Narrow on `entityType` to get the entity's type.
 */
export type FavoritedEntity = StampedEntity<'favoritedAt'>;
