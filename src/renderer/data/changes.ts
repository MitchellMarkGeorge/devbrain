import type { QueryClient } from '@tanstack/react-query';
import type { ChangedEntity } from '@common/changes';
import type { AppEvents } from '@common/events';
import type { EventClient } from '../ipc/events';
import { invalidateFor } from './invalidation';
import { queryClient } from './queryClient';

export interface ChangeSyncOptions {
  // a flush waits this long after the last change it collects
  trailingMs?: number;
  // and at most this long after the first
  maxWaitMs?: number;
}

export interface ChangeSync {
  // the IPC link's `onChanged`: refetches what a call changed before the call settles
  applyChanges(changed: ChangedEntity[]): Promise<void>;
  // listens for `db.changes` and `workspace.changed`; returns the function that stops
  listen(events: EventClient<AppEvents>): () => void;
}

// Keeps the query cache current with what core changes. A mutation's own changes are refetched
// before it resolves, so its caller sees them. Everything else (broadcasts, and the changes of a
// mutation that overlapped others) goes into one dirty set, flushed in a single invalidation once
// changes stop coming for `trailingMs`, or `maxWaitMs` after the first. Flushes are held while a
// mutation is pending, so a refetch can't overwrite an optimistic update with data from before that
// mutation committed; they resume when the last one settles.
export function createChangeSync(
  queryClient: QueryClient,
  { trailingMs = 16, maxWaitMs = 250 }: ChangeSyncOptions = {},
): ChangeSync {
  const dirty = new Set<ChangedEntity>();
  let trailing: ReturnType<typeof setTimeout> | undefined;
  let deadline: ReturnType<typeof setTimeout> | undefined;

  function cancel() {
    clearTimeout(trailing);
    clearTimeout(deadline);
    trailing = deadline = undefined;
  }

  function schedule() {
    clearTimeout(trailing);
    trailing = setTimeout(flush, trailingMs);
    deadline ??= setTimeout(flush, maxWaitMs);
  }

  // takes the dirty set, leaving it empty
  function take(): ChangedEntity[] {
    const entities = [...dirty];
    dirty.clear();
    cancel();
    return entities;
  }

  function flush() {
    cancel();
    // held: the mutation cache's listener schedules again once the last mutation settles
    if (dirty.size === 0 || queryClient.isMutating() > 0) return;
    void invalidateFor(queryClient, take());
  }

  function add(entities: ChangedEntity[]) {
    for (const entity of entities) dirty.add(entity);
    if (dirty.size > 0) schedule();
  }

  return {
    async applyChanges(changed) {
      // a query's, or a mutation that changed nothing: what is held waits for the cache to settle
      if (changed.length === 0) return;
      // a call not made through React Query isn't counted, so 0 can mean this one
      if (queryClient.isMutating() > 1) {
        add(changed);
        return;
      }
      // the only mutation in flight: refetch now, with what was held for it
      await invalidateFor(queryClient, [...changed, ...take()]);
    },

    listen(events) {
      const unsubscribes = [
        events.on('db.changes', ({ entities }) => add(entities)),
        events.on('workspace.changed', () => {
          // nothing cached belongs to the workspace now open. Not `clear()`: a mounted query would
          // keep showing the old workspace's data until something rendered it again
          dirty.clear();
          cancel();
          void queryClient.resetQueries();
        }),
        queryClient.getMutationCache().subscribe((event) => {
          const settled =
            event.type === 'updated' &&
            (event.action.type === 'success' || event.action.type === 'error');
          if (settled && dirty.size > 0 && queryClient.isMutating() === 0) schedule();
        }),
      ];
      return () => {
        for (const unsubscribe of unsubscribes) unsubscribe();
        cancel();
      };
    },
  };
}

const changeSync = createChangeSync(queryClient);

// the app's: ../ipc passes applyChanges to its link, and main.tsx starts listening
export const applyChanges = changeSync.applyChanges;
export const listenForChanges = changeSync.listen;
