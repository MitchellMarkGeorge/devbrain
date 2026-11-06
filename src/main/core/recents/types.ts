import type { RecentEntityType } from '@common/types';

export interface RecentsFilterOptions {
  /** restrict the list to one kind of entity (defaults to 'all') */
  entityType?: RecentEntityType | 'all';
}
