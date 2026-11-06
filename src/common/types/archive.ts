import type { NoteId, ProjectId, TaskId } from '../ids';

export type ArchivableId = NoteId | TaskId | ProjectId;

export type ArchivableEntityType = 'tasks' | 'projects' | 'notes';

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

/** What emptying the trash deleted for good. */
export interface EmptyTrashResult {
  taskIds: TaskId[];
  projectIds: ProjectId[];
  noteIds: NoteId[];
  // Archived tasks left in the trash: each has an active or synced task below it, which deleting
  // it would take along (sync can archive a removed Linear task and leave its subtasks live)
  keptTaskIds: TaskId[];
  // deleted notes whose markdown file could not be removed; the notes are gone all the same
  filesNotRemoved: NoteId[];
}
