import type { Note } from '../notes/types';
import type { Project } from '../projects/types';
import type { Task } from '../tasks/types';

export type SearchResultKind = 'note' | 'task' | 'project';

export interface SearchResult {
  kind: SearchResultKind;
  item: Note | Task | Project;
  rank: number;
}

export interface SearchOptions {
  query: string;
  kinds?: SearchResultKind[];
  limit?: number;
}
