import type { EventId, NoteId, ProjectId, TaskId } from '../ids';
import type { ExternalRef } from './integrations';
import type { TaskStatus } from './tasks';

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
  // a task's status, read when it was found; null for every other type
  status: TaskStatus | null;
  // a project's colour, or an event's own colour, else its calendar's (as Event.color says); null
  // for a task or note, or when there is none. Untrusted, like every colour from core: parse it
  // with hexColorSchema before it reaches a style
  color: string | null;
  // the provider item a task, project or event mirrors (its key draws the source pill); null for a
  // local one or a note
  external: ExternalRef | null;
}

// How many entries match a query, of each type: every match, not only the ones a search's limit
// returns. ⌘K's type filter shows them.
export type SearchCounts = Record<SearchEntityType, number>;
