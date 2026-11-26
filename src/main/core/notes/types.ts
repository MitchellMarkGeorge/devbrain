import type { EventId, ProjectId, TaskId } from '@common/ids';
import type { NoteLinkKind, OneOrMany } from '@common/types';

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
  // a list: the notes in any of these projects, null among them being the notes in none
  projectId?: OneOrMany<ProjectId | null>;
  linkedEventId?: EventId | null;
  linkedTaskId?: TaskId | null;
  // the notes linked to any event, to any task, or to neither (the Notes page's "Linked to"
  // filter); a list: the notes that are any of these
  linkedTo?: OneOrMany<NoteLinkKind>;
  // when the note was last edited: from this instant on (inclusive), and before this one
  // (exclusive). The caller works out the days; either may be given alone.
  editedFrom?: Date;
  editedBefore?: Date;
  // true: the notes that tasks were made from (a task not in the trash names the note);
  // false: the notes with no such task
  hasTasks?: boolean;
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
