import type { EventId, NoteId, ProjectId, TaskId } from '../ids';

export type SearchEntityType = 'note' | 'task' | 'project' | 'event';

// What search returns. `title` and `body` are HTML, unlike the text core indexes: escaped, with
// each match in <b>…</b>, the only markup they hold (docs/security/untrusted-content.md)
export interface SearchResult {
  entityId: NoteId | TaskId | ProjectId | EventId;
  entityType: SearchEntityType;
  // the whole title
  title: string;
  // an excerpt of the body around the matches, '…' where it was cut
  body: string;
  rank: number;
}
