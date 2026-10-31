import { EventId, NoteId, ProjectId, TaskId } from '@common/ids';
import { Archivable, Model } from '../shared/model';
import type { EventSummary, ProjectSummary, TaskSummary } from '../shared/summaries';

export interface Note extends Model<NoteId>, Archivable {
  title: string; // think about untitled notes
  preview: string | null;
  projectId: ProjectId | null;
  linkedEventId: EventId | null;
  linkedTaskId: TaskId | null;
}

// What a note row shows beside the note's own fields, returned by listNotes.
export interface NoteListItem extends Note {
  project: ProjectSummary | null;
  // the event or task the note is linked to
  link: NoteLinkSummary | null;
}

export type NoteLinkSummary = ({ type: 'event' } & EventSummary) | ({ type: 'task' } & TaskSummary);

export interface CreateNoteOptions {
  title?: string;
  projectId?: ProjectId | null;
  linkedEventId?: EventId | null;
  linkedTaskId?: TaskId | null;
}

export interface NoteFilterOptions {
  // allowing null for some options to be able to test the absence of said links
  // for example, getting all notes that are without a project
  projectId?: ProjectId | null;
  linkedEventId?: EventId | null;
  linkedTaskId?: TaskId | null;
}

export interface NoteSortOptions {
  sortBy: 'createdAt' | 'updatedAt' | 'title';
  direction?: 'asc' | 'desc';
}

export interface UpdateNoteOptions {
  title?: string;
  projectId?: ProjectId | null;
  // either, not both
  linkedEventId?: EventId | null;
  linkedTaskId?: TaskId | null;
}

/**
 * What deleting a note changed: the note is gone, and the tasks that linked to it, kept, lost the
 * link (`unlinkedTaskIds`). `fileRemoved` is false when the row was deleted but its markdown file
 * could not be removed; the file is left behind in the notes folder, where nothing reads it.
 */
export interface NoteDeleteResult {
  noteId: NoteId;
  unlinkedTaskIds: TaskId[];
  fileRemoved: boolean;
}
