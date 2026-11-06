import type { FavoritableEntityType } from '@common/types';

export interface FavoritesFilterOptions {
  /** restrict the list to one kind of entity (defaults to 'all') */
  entityType?: FavoritableEntityType | 'all';
}
