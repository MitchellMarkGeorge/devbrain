import { EventId, NoteId, ProjectId, TaskId } from '@common/ids';

export type SearchEntityType = 'note' | 'task' | 'project' | 'event';

export interface IndexEntity {
  title: string;
  body: string;
  entityId: NoteId | TaskId | ProjectId | EventId;
  entityType: SearchEntityType;
}

// What search returns. `title` and `body` are HTML, unlike IndexEntity's text: escaped, with each
// match in <b>…</b>, the only markup they hold (docs/security/untrusted-content.md)
export interface SearchResult extends IndexEntity {
  // the whole title
  title: string;
  // an excerpt of the body around the matches, '…' where it was cut
  body: string;
  rank: number;
}

export interface SearchOptions {
  query: string;
  entityType: SearchEntityType[];
  limit?: number;
}
