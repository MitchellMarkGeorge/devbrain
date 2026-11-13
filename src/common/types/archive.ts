import type { NoteId, ProjectId, TaskId } from '../ids';
import type { ExternalRef } from './integrations';
import type { ProjectStatus } from './projects';
import type { ProjectSummary } from './shared';
import type { TaskStatus } from './tasks';

export type ArchivableId = NoteId | TaskId | ProjectId;

export type ArchivableEntityType = 'tasks' | 'projects' | 'notes';

/**
 * A row in Trash: what the three kinds share (id, kind, title, when it was trashed), and what each
 * row draws of its own kind. Pills name the item's links and source as summaries, so the page needs
 * no other read. `archive.listArchived` pages the three tables as one union by `archivedAt`, then
 * reads these fields with one query per kind on the page.
 */
interface ArchivedBase<Id extends ArchivableId, Type extends ArchivableEntityType> {
  id: Id;
  entityType: Type;
  title: string;
  archivedAt: Date;
}

export interface ArchivedTask extends ArchivedBase<TaskId, 'tasks'> {
  status: TaskStatus;
  // its project, as a pill; null when it has none (or the project was deleted)
  project: ProjectSummary | null;
  // the link to the provider item it mirrors (its key as a pill), or null for a local task
  external: ExternalRef | null;
}

export interface ArchivedProject extends ArchivedBase<ProjectId, 'projects'> {
  status: ProjectStatus;
  // untrusted: parse it before drawing (docs/security/untrusted-content.md)
  color: string | null;
  external: ExternalRef | null;
}

export interface ArchivedNote extends ArchivedBase<NoteId, 'notes'> {
  // the note's first line
  preview: string | null;
  project: ProjectSummary | null;
}

export type ArchivedEntity = ArchivedTask | ArchivedProject | ArchivedNote;

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
