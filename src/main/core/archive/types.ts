import type { NoteId, ProjectId, TaskId } from '@common/ids';

export type ArchivableId = NoteId | TaskId | ProjectId;

export interface ArchiveResult {
  id: ArchivableId;
  archivedAt: Date;
}
