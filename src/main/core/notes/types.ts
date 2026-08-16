import { EventId, NoteId, ProjectId, TaskId } from '@common/ids';
import { Archivable, Model } from '../shared/model';

export interface Note extends Model<NoteId>, Archivable {
  title: string; // think about untitled notes
  preview: string | null;
  projectId: ProjectId | null;
  linkedEventId: EventId | null;
  linkedTaskId: TaskId | null;
}

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
  sortBy: 'created' | 'lastUpdated' | 'title';
  direction?: 'asc' | 'desc';
}

export interface UpdateNoteOptions {
  title?: string;
  projectId?: ProjectId | null;
  // either, not both
  linkedEventId?: EventId | null;
  linkedTaskId?: TaskId | null;
}
