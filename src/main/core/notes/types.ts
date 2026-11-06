import type { EventId, ProjectId, TaskId } from '@common/ids';

export interface CreateNoteOptions {
  title?: string;
  projectId?: ProjectId | null;
  linkedEventId?: EventId | null;
  linkedTaskId?: TaskId | null;
  // the note's markdown; a new note is empty by default
  content?: string;
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
