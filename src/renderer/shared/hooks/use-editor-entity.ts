import { useQuery, type UseQueryOptions } from '@tanstack/react-query';
import { hexColorSchema } from '@common/color';
import { isId, type EventId, type NoteId, type ProjectId, type TaskId } from '@common/ids';
import { trpc } from '@renderer/ipc';
import type { EditorEntity, EditorEntityType } from '@renderer/editor/types';
import { ipcErrorCode } from '../lib/workspace/errors';

// The entities behind an editor's pills, from React Query's cache: one query per pill, through the
// routes that read one entity (`tasks.get`, `projects.get`, `notes.get`, `events.get`). The query
// invalidator refetches them when core reports a change, so a renamed or completed task updates
// its pills.

// an entity link whose id has the shape of its type's ids, so a route can read it
export type EditorEntityRef =
  | { type: 'task'; id: TaskId }
  | { type: 'project'; id: ProjectId }
  | { type: 'note'; id: NoteId }
  | { type: 'event'; id: EventId };

// the link as a ref, or null when its id is no id of its type (it can name no entity)
export function editorEntityRef(type: EditorEntityType, id: string): EditorEntityRef | null {
  return isId(type, id) ? ({ type, id } as EditorEntityRef) : null;
}

function entityQuery(ref: EditorEntityRef) {
  switch (ref.type) {
    case 'task':
      return trpc.tasks.get.queryOptions({ id: ref.id });
    case 'project':
      return trpc.projects.get.queryOptions({ id: ref.id });
    case 'note':
      return trpc.notes.get.queryOptions({ id: ref.id });
    case 'event':
      return trpc.events.get.queryOptions({ id: ref.id });
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
 * (or one in the trash) is null, so its pill is drawn as missing. WorkspaceEntityPill calls it,
 * once it has checked the link's id (editorEntityRef).
 */
export function useEditorEntity(ref: EditorEntityRef): EditorEntity | null | undefined {
  const { type, id } = ref;
  // the four routes' rows differ, so the union of their options is no one useQuery overload: read
  // each as EntityRow, the fields used below (status only for a task, startAt only for an event)
  const { data: row, error } = useQuery({
    ...(entityQuery(ref) as UseQueryOptions<EntityRow>),
    retry: false,
  });
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
