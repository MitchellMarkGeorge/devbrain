import type { EventId, NoteId, ProjectId, TaskId } from '../ids';
import type { Archivable, EventSummary, Model, ProjectSummary, TaskSummary } from './shared';

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

/**
 * What deleting a note changed: the note is gone, and the tasks it was linked with, kept, lost the
 * link. `linkedTaskId` is the task the note was the task note of (null when it was not one): that
 * task now has no task note. `unlinkedTaskIds` are the tasks made from the note
 * (`tasks.linkedNoteId`), subtasks included. `fileRemoved` is false when the row was deleted but
 * its markdown file could not be removed; the file is left behind in the notes folder, where
 * nothing reads it.
 */
export interface NoteDeleteResult {
  noteId: NoteId;
  linkedTaskId: TaskId | null;
  unlinkedTaskIds: TaskId[];
  fileRemoved: boolean;
}
