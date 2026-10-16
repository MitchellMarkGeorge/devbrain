import { EventId, NoteId, ProjectId, TaskId } from '@common/ids';

export type SearchEntityType = 'note' | 'task' | 'project' | 'event';

export interface IndexEntity {
  title: string;
  body: string;
  entityId: NoteId | TaskId | ProjectId | EventId;
  entityType: SearchEntityType;
}

export interface SearchResult extends IndexEntity {
  rank: number;
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
