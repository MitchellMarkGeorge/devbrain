import type { EventId, NoteId, ProjectId, TaskId } from '@common/ids';
import type { SearchEntityType } from '@common/types';

// what the index holds for an entity, as text; search returns SearchResult (@common/types)
export interface IndexEntity {
  title: string;
  body: string;
  entityId: NoteId | TaskId | ProjectId | EventId;
  entityType: SearchEntityType;
}

export interface SearchOptions {
  query: string;
  entityType: SearchEntityType[];
  limit?: number;
}

export interface RebuildResult {
  // entries the index holds once rebuilt
  indexed: number;
  // active notes left out because their files couldn't be read
  unreadableNoteIds: NoteId[];
}
