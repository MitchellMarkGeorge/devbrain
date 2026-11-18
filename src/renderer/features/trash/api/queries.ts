import type { ArchivableEntityType } from '@common/types';
import { trpc } from '@renderer/ipc';

const PAGE_SIZE = 50;

/** The trash, most recently trashed first, paged by core's cursor: every kind, or one. */
export function trashListQuery(entityType: ArchivableEntityType | 'all') {
  return trpc.archive.listArchived.infiniteQueryOptions(
    { entityType, limit: PAGE_SIZE },
    { getNextPageParam: (page) => page.nextCursor },
  );
}
