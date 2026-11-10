import type { SearchEntityType, SearchResult } from '@common/types';

// What ⌘K draws from search.search's results: the type filter, its counts, and the groups.

/** The type filter: every type, or one. */
export type SearchFilter = 'all' | SearchEntityType;

/** The filter's items in order, which Tab and ⇧Tab step through. */
export const FILTERS: readonly SearchFilter[] = ['all', 'task', 'note', 'project', 'event'];

/** The groups' labels, in the order "All" shows them (Figma `7170:15331`). */
export const GROUP_LABELS: Record<SearchEntityType, string> = {
  task: 'Tasks',
  note: 'Notes',
  project: 'Projects',
  event: 'Events',
};

const GROUP_ORDER: SearchEntityType[] = ['task', 'note', 'project', 'event'];

/** "All" lists this many of each type; a type's own filter lists every match it has. */
export const PER_GROUP = 5;

export interface ResultGroup {
  type: SearchEntityType;
  label: string;
  /** every match of the type, though "All" lists at most PER_GROUP of them */
  count: number;
  results: SearchResult[];
}

/** How many results each filter has: `all` and one count per type. */
export function countResults(results: readonly SearchResult[]): Record<SearchFilter, number> {
  const counts: Record<SearchFilter, number> = { all: 0, task: 0, note: 0, project: 0, event: 0 };
  for (const { entityType } of results) {
    counts.all += 1;
    counts[entityType] += 1;
  }
  return counts;
}

/**
 * The results as the list's groups, best first within each: a group per type with matches for
 * "All" (PER_GROUP of each), or the one type's group with all of them.
 */
export function groupResults(
  results: readonly SearchResult[],
  filter: SearchFilter,
): ResultGroup[] {
  const types = filter === 'all' ? GROUP_ORDER : [filter];
  return types.flatMap((type) => {
    const matches = results.filter(({ entityType }) => entityType === type);
    if (matches.length === 0) return [];
    return [
      {
        type,
        label: GROUP_LABELS[type],
        count: matches.length,
        results: filter === 'all' ? matches.slice(0, PER_GROUP) : matches,
      },
    ];
  });
}

/** The filter Tab (`step` 1) or ⇧Tab (-1) moves to, wrapping round. */
export function nextFilter(current: SearchFilter, step: 1 | -1): SearchFilter {
  const at = FILTERS.indexOf(current);
  return FILTERS[(at + step + FILTERS.length) % FILTERS.length];
}

// escaped text (no raw <, > or & outside an entity) with <b> and </b> around matches
const SEARCH_HTML = /^(?:[^<>&]|&(?:amp|lt|gt|quot|#39);|<b>|<\/b>)*$/;

/**
 * Whether `html` is what core's search returns: escaped text whose only markup is `<b>` and
 * `</b>` (docs/security/untrusted-content.md). `SearchHighlight` renders nothing else as HTML.
 */
export function isSearchHtml(html: string): boolean {
  return SEARCH_HTML.test(html);
}
