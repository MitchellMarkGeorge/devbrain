import type { TrashableEntityType, TrashableId } from '@common/types';

export interface TrashResult {
  id: TrashableId;
  trashedAt: Date;
}

export interface TrashFilterOptions {
  /** restrict the list to one kind of entity (defaults to 'all') */
  entityType?: TrashableEntityType | 'all';
}
