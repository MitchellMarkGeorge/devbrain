import type { SearchResult } from './types';

export class SearchService {
  constructor() {}

  async search(): Promise<SearchResult[]> {
    throw new Error('Not implemented');
  }
}
