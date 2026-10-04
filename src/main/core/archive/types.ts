import type { NoteId, ProjectId, TaskId } from '@common/ids';

export type ArchivableId = NoteId | TaskId | ProjectId;

export interface ArchiveResult {
  id: ArchivableId;
  archivedAt: Date;
}

export type ArchivableEntityType = 'tasks' | 'projects' | 'notes';

export interface ArchiveFilterOptions {
  /** restrict the list to one kind of entity (defaults to 'all') */
  entityType?: ArchivableEntityType | 'all';
}

/**
 * A single row in the archive view. Deliberately a lightweight summary rather
 * than the full task/project/note row: the three tables have nothing in common
 * beyond these columns, so this is what a UNION across them can carry. Callers
 * that need the whole entity can follow up with the owning service's getByIds.
 */
export interface ArchivedEntity {
  id: ArchivableId;
  entityType: ArchivableEntityType;
  title: string;
  archivedAt: Date;
}
