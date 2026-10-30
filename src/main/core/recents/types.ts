import type { StampedEntity, StampedEntityType, StampedId } from '../shared/stamped';

export type RecentId = StampedId;

export type RecentEntityType = StampedEntityType;

export interface RecentsFilterOptions {
  /** restrict the list to one kind of entity (defaults to 'all') */
  entityType?: RecentEntityType | 'all';
}

/**
 * A single row in the recents list: the whole entity under `entity`, as its service reads it, and
 * when it was last viewed. Narrow on `entityType` to get the entity's type.
 */
export type RecentEntity = StampedEntity<'viewedAt'>;
