import type { StampedEntity, StampedEntityType, StampedId } from '../shared/stamped';

export type RecentId = StampedId;

export type RecentEntityType = StampedEntityType;

export interface RecentsFilterOptions {
  /** restrict the list to one kind of entity (defaults to 'all') */
  entityType?: RecentEntityType | 'all';
}

/**
 * A single row in the recents list: the same lightweight summary as a favorite, with when the
 * entity was last viewed. Callers that need the whole entity can follow up with the owning
 * service's getByIds.
 */
export type RecentEntity = StampedEntity<'viewedAt'>;
