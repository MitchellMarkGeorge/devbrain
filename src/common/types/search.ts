import type { Event } from './events';
import type { NoteListItem } from './notes';
import type { ProjectListItem } from './projects';
import type { TaskListItem } from './tasks';

export type SearchEntityType = 'note' | 'task' | 'project' | 'event';

// What one match is, by type: the entity itself, as its list returns it.
interface SearchEntities {
  task: TaskListItem;
  note: NoteListItem;
  project: ProjectListItem;
  event: Event;
}

// A match for a query, of one type: the entity found, as its list returns it, and where the query
// matched. `title` and `body` are HTML, unlike the text core indexes: escaped, with each match in
// <b>…</b>, the only markup they hold (docs/security/untrusted-content.md). Everything else is
// read from `entity`, as anywhere that entity is drawn.
export type SearchResult<Type extends SearchEntityType = SearchEntityType> = {
  [K in Type]: {
    entityType: K;
    entity: SearchEntities[K];
    // the whole title, highlighted
    title: string;
    // an excerpt of the body around the matches, '…' where it was cut, highlighted
    body: string;
    // a synced task's provider key (ENG-123), highlighted; '' for a task with none and other types
    key: string;
    rank: number;
  };
}[Type];

// How many entries match a query, of each type: every match, not only the ones a search's limit
// returns. ⌘K's type filter shows them.
export type SearchCounts = Record<SearchEntityType, number>;
