import {
  QueryObserver,
  queryOptions,
  useQueryClient,
  type QueryClient,
} from '@tanstack/react-query';
import { useMemo } from 'react';
import { isId } from '@common/ids';
import type { EntitySummary, StampedId } from '@common/types';
import { resolveColor } from '@renderer/components';
import { ipc } from '@renderer/ipc';
import type { EditorEntity, EditorEntityType, EditorHost } from './types';

// The entities behind an editor's pills, from React Query's cache: one query per pill, keyed as
// `notes.mentions` for that one id, so the query invalidator refetches it when core reports a
// change and a renamed or completed task updates its pills. The queries a turn starts (a note's
// pills mounting, or all of them refetching after a change) are sent as one call: a note with 550
// task pills made 550 calls of `tasks.get` on opening and again after each save
// (docs/performance.md).

/** the most ids one `notes.mentions` call takes (its route's MAX_MENTION_IDS) */
const BATCH_SIZE = 500;

interface Waiter {
  resolve(summary: EntitySummary | null): void;
  reject(error: unknown): void;
}

/**
 * Loads summaries by id, gathering the ids asked for in one turn into calls of up to BATCH_SIZE.
 * Resolves each with its summary, or null when the entity is gone or archived.
 */
export function createSummaryLoader(
  fetch: (ids: StampedId[]) => Promise<EntitySummary[]>,
): (id: StampedId) => Promise<EntitySummary | null> {
  let waiting = new Map<StampedId, Waiter[]>();
  const send = () => {
    const batch = waiting;
    waiting = new Map();
    const ids = [...batch.keys()];
    for (let i = 0; i < ids.length; i += BATCH_SIZE) {
      const chunk = ids.slice(i, i + BATCH_SIZE);
      fetch(chunk).then(
        (summaries) => {
          const byId = new Map(summaries.map((summary) => [summary.id, summary]));
          for (const id of chunk) {
            for (const waiter of batch.get(id)!) waiter.resolve(byId.get(id) ?? null);
          }
        },
        (error: unknown) => {
          for (const id of chunk) for (const waiter of batch.get(id)!) waiter.reject(error);
        },
      );
    }
  };
  return (id) =>
    new Promise((resolve, reject) => {
      if (waiting.size === 0) setTimeout(send, 0);
      waiting.set(id, [...(waiting.get(id) ?? []), { resolve, reject }]);
    });
}

const loadSummary = createSummaryLoader((ids) => ipc.notes.mentions.query({ ids }));

function entityQuery(type: EditorEntityType, id: string) {
  // an id of no entity of its type is no entity
  if (!isId(type, id)) return null;
  return queryOptions({
    // tRPC's key for `notes.mentions` of this one id, which the query invalidator reads the
    // route from; its data is that id's summary
    queryKey: [['notes', 'mentions'], { input: { ids: [id] }, type: 'query' }] as const,
    queryFn: () => loadSummary(id as StampedId),
  });
}

function resolve(
  queryClient: QueryClient,
  type: EditorEntityType,
  id: string,
): EditorEntity | null | undefined {
  const options = entityQuery(type, id);
  if (!options) return null;
  const state = queryClient.getQueryState(options.queryKey);
  if (state?.data === undefined) return undefined;
  const summary = state.data as EntitySummary | null;
  // gone, archived, or an id of another type
  if (summary === null || summary.type !== type) return null;
  return {
    type,
    id,
    title: summary.title,
    status: summary.type === 'task' ? summary.status : undefined,
    color:
      summary.type === 'project' || summary.type === 'event'
        ? resolveColor(summary.color)
        : undefined,
  };
}

/**
 * The editor host's `resolveEntity` and `watchEntity`, from React Query: a pill shows its entity's
 * current title, status and colour, loads it the first time it is drawn, and draws again when it
 * changes. A deleted entity's pill is drawn as missing. Pass it to every `RichTextEditor`, with
 * `useWorkspaceEditorHost` (or take the three together from the app's `useEditorHost`).
 */
export function useEntityResolver(): Pick<EditorHost, 'resolveEntity' | 'watchEntity'> {
  const queryClient = useQueryClient();
  return useMemo(
    () => ({
      resolveEntity: (type, id) => resolve(queryClient, type, id),
      watchEntity(type, id, onChange) {
        const options = entityQuery(type, id);
        if (!options) return () => {};
        // an observer loads the entity (once, while it's fresh) and hears every change to it
        const observer = new QueryObserver(queryClient, { ...options, retry: false });
        return observer.subscribe(() => onChange());
      },
    }),
    [queryClient],
  );
}
