import { skipToken, useQuery, type UseQueryOptions } from '@tanstack/react-query';
import { hexColorSchema } from '@common/color';
import { isId } from '@common/ids';
import { trpc } from '@renderer/ipc';
import type { EditorEntity, EditorEntityType } from '@renderer/editor/types';
import { ipcErrorCode } from '../lib/workspace/errors';

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
  startAt?: Date | null;
}

/**
 * An editor pill's entity, from React Query: its current title, status and colour, loaded the first
 * time its pill is drawn and drawn again when it changes; undefined until then. A deleted entity
 * (or one in the trash) is null, so its pill is drawn as missing. WorkspaceEntityPill calls it.
 */
export function useEditorEntity(
  type: EditorEntityType,
  id: string,
): EditorEntity | null | undefined {
  const options = entityQuery(type, id);
  const { data: row, error } = useQuery<EntityRow>(
    options
      ? { ...(options as unknown as UseQueryOptions<EntityRow>), retry: false }
      : { queryKey: ['editor', 'no-entity'], queryFn: skipToken },
  );
  // an id of no entity of its type is no entity
  if (!options) return null;
  if (row) {
    if (row.archivedAt) return null;
    return {
      type,
      id,
      title: row.title,
      status: type === 'task' ? row.status : undefined,
      // checked, not resolved: the pill resolves it (as the "@" menu's results)
      color:
        type === 'project' || type === 'event'
          ? hexColorSchema.safeParse(row.color).data
          : undefined,
      startAt: type === 'event' ? row.startAt : undefined,
    };
  }
  if (error && ipcErrorCode(error) === 'not_found') return null;
  return undefined;
}
