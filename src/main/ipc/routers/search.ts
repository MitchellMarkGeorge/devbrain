import { z } from 'zod';
import { MAX_PAGE_LIMIT } from '@main/core/shared/pagination';
import type { SearchEntityType, SearchResult } from '@main/core/search/types';
import { wsProcedure } from '../procedures';
import { t } from '../trpc';

// Full-text search over tasks, projects, notes and events.

const ENTITY_TYPES = [
  'task',
  'project',
  'note',
  'event',
] as const satisfies readonly SearchEntityType[];

export const searchRouter = t.router({
  // The matches, best first. A result's `title` and `body` are HTML, the only HTML core returns:
  // escaped text with each match in <b>…</b> (docs/security/untrusted-content.md).
  search: wsProcedure
    .input(
      z.object({
        query: z.string(),
        // every type when empty
        entityType: z.array(z.enum(ENTITY_TYPES)).default([]),
        limit: z.number().int().positive().max(MAX_PAGE_LIMIT).optional(),
      }),
    )
    .query(({ ctx, input }): SearchResult[] => ctx.workspace.search.search(input)),
});
