import type { EventId, NoteId, ProjectId, TaskId } from '../ids';
import type { EventSummary, NoteSummary, ProjectSummary, TaskSummary } from './shared';

// Mentions: where a task, project, note or event is linked from the text of another item (a
// `devbrain://` link in a note or a description; see src/common/entity-links.ts).

/**
 * What can mention: an item with text the user writes in DevBrain as markdown (a note, a task's,
 * project's or event's description). A synced item's text is the provider's, so it never does.
 */
export type MentionSourceId = TaskId | ProjectId | NoteId | EventId;

/** what can be mentioned */
export type MentionTargetId = TaskId | ProjectId | NoteId | EventId;

/**
 * The item a mention is in, with the fields its row shows. A note that is an event's note says so
 * with `linkedEventId`, so it can be shown as that event's.
 */
export type MentionSource =
  | ({ type: 'task' } & TaskSummary)
  | ({ type: 'project' } & ProjectSummary)
  | ({ type: 'event' } & EventSummary)
  | ({ type: 'note'; linkedEventId: EventId | null } & NoteSummary);

/** One item that mentions another, and the line it does it in. */
export interface Mention {
  source: MentionSource;
  /** when the source last changed */
  updatedAt: Date;
  /** how many times the source mentions the item */
  count: number;
  /**
   * The line of the first mention as plain text, either side of it: "Close SR-12 once " and
   * " ships to mobile". Long lines are cut with "…".
   */
  contextBefore: string;
  contextAfter: string;
}
