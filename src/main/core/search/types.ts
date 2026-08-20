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
