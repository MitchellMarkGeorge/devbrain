import type { ArchivableEntityType } from '@common/types';
import { trpc } from '@renderer/ipc';

/** At most this many pages stay loaded; scrolling back past them reloads the earlier ones. */
const MAX_PAGES = 10;
const PAGE_SIZE = 50;

/** The trash, most recently trashed first, paged by core's cursor: every kind, or one. */
export function trashListQuery(entityType: ArchivableEntityType | 'all') {
  return trpc.archive.listArchived.infiniteQueryOptions(
    { entityType, limit: PAGE_SIZE },
    { getNextPageParam: (page) => page.nextCursor, maxPages: MAX_PAGES },
  );
}
