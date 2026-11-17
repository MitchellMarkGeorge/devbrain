import type { NoteId, ProjectId, TaskId } from '../ids';
import type { ExternalRef } from './integrations';
import type { ProjectStatus } from './projects';
import type { ProjectSummary } from './shared';
import type { TaskStatus } from './tasks';

export type TrashableId = NoteId | TaskId | ProjectId;

export type TrashableEntityType = 'tasks' | 'projects' | 'notes';

/**
 * A row in Trash: what the three kinds share (id, kind, title, when it was trashed), and what each
 * row draws of its own kind. Pills name the item's links and source as summaries, so the page needs
 * no other read. `trash.listTrashed` pages the three tables as one union by `trashedAt`, then
 * reads these fields with one query per kind on the page.
 */
interface TrashedBase<Id extends TrashableId, Type extends TrashableEntityType> {
  id: Id;
  entityType: Type;
  title: string;
  trashedAt: Date;
}

export interface TrashedTask extends TrashedBase<TaskId, 'tasks'> {
  status: TaskStatus;
  // its project, as a pill; null when it has none (or the project was deleted)
  project: ProjectSummary | null;
  // the link to the provider item it mirrors (its key as a pill), or null for a local task
  external: ExternalRef | null;
}

export interface TrashedProject extends TrashedBase<ProjectId, 'projects'> {
  status: ProjectStatus;
  // untrusted: parse it before drawing (docs/security/untrusted-content.md)
  color: string | null;
  external: ExternalRef | null;
}

export interface TrashedNote extends TrashedBase<NoteId, 'notes'> {
  // the note's first line
  preview: string | null;
  project: ProjectSummary | null;
}

export type TrashedEntity = TrashedTask | TrashedProject | TrashedNote;

/** Rows chosen in Trash, by kind: what `trash.restoreMany` and `trash.deleteMany` act on. */
export interface TrashSelection {
  taskIds: TaskId[];
  projectIds: ProjectId[];
  noteIds: NoteId[];
}

/**
 * What `trash.restoreMany` brought back: the rows chosen and every row their cascades restored
 * (a project's tasks and notes, a task's subtree and notes).
 */
export type RestoreResult = TrashSelection;

/** What deleting from the trash removed for good: all of it (emptyTrash), or a selection (deleteMany). */
export interface EmptyTrashResult {
  taskIds: TaskId[];
  projectIds: ProjectId[];
  noteIds: NoteId[];
  // Trashed tasks left in the trash: each has an active or synced task below it, which deleting
  // it would take along (sync can trash a removed Linear task and leave its subtasks live)
  keptTaskIds: TaskId[];
  // deleted notes whose markdown file could not be removed; the notes are gone all the same
  filesNotRemoved: NoteId[];
}
