import type { ArchivableEntityType, ArchivableId } from '@common/types';

export interface ArchiveResult {
  id: ArchivableId;
  archivedAt: Date;
}

export interface ArchiveFilterOptions {
  /** restrict the list to one kind of entity (defaults to 'all') */
  entityType?: ArchivableEntityType | 'all';
}
