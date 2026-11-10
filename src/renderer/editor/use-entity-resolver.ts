import {
  QueryObserver,
  useQueryClient,
  type QueryClient,
  type QueryObserverOptions,
} from '@tanstack/react-query';
import { useMemo } from 'react';
import { isId } from '@common/ids';
import { resolveColor } from '../components';
import { trpc } from '../ipc';
import { ipcErrorCode } from '../workspace/errors';
import type { EditorEntity, EditorEntityType, EditorHost } from './types';

// The entities behind an editor's pills, from React Query's cache: one query per pill, through the
// routes that read one entity (`tasks.get`, `projects.get`, `notes.get`, `events.get`). The query
// invalidator refetches them when core reports a change, so a renamed or completed task updates
// its pills.

function entityQuery(type: EditorEntityType, id: string) {
  switch (type) {
    case 'task':
      return isId('task', id) ? trpc.tasks.get.queryOptions({ id }) : null;
    case 'project':
      return isId('project', id) ? trpc.projects.get.queryOptions({ id }) : null;
    case 'note':
      return isId('note', id) ? trpc.notes.get.queryOptions({ id }) : null;
    case 'event':
      return isId('event', id) ? trpc.events.get.queryOptions({ id }) : null;
  }
}

interface EntityRow {
  title: string;
  archivedAt?: Date | null;
  status?: EditorEntity['status'];
  color?: string | null;
}

function resolve(
  queryClient: QueryClient,
  type: EditorEntityType,
  id: string,
): EditorEntity | null | undefined {
  const options = entityQuery(type, id);
  // an id of no entity of its type is no entity
  if (!options) return null;
  const state = queryClient.getQueryState(options.queryKey);
  const row = state?.data as EntityRow | undefined;
  if (row) {
    if (row.archivedAt) return null;
    return {
      type,
      id,
      title: row.title,
      status: type === 'task' ? row.status : undefined,
      color: type === 'project' || type === 'event' ? resolveColor(row.color) : undefined,
    };
  }
  if (state?.status === 'error' && ipcErrorCode(state.error) === 'not_found') return null;
  return undefined;
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
        const observer = new QueryObserver(queryClient, {
          ...(options as QueryObserverOptions<EntityRow>),
          retry: false,
        });
        return observer.subscribe(() => onChange());
      },
    }),
    [queryClient],
  );
}
