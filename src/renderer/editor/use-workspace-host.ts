import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useMemo } from 'react';
import { hexColorSchema } from '@common/color';
import type { SearchResult } from '@common/types';
import { trpc } from '@renderer/ipc';
import { highlightToText } from './highlight';
import type { EditorEntity, EditorHost, MentionType } from './types';

/**
 * The parts of an editor's host every page shares: "@" search over the open workspace and opening
 * links. A page adds what only it knows, such as resolveEntity from the rows it already holds and
 * onOpenEntity from its router:
 *
 *   const host = useWorkspaceEditorHost();
 *   <RichTextEditor {...host} value={note.content} onChange={save} onOpenEntity={open} label="Note" />
 */
export function useWorkspaceEditorHost(): Pick<EditorHost, 'searchEntities' | 'onOpenUrl'> {
  const queryClient = useQueryClient();
  const { mutate: openUrl } = useMutation(trpc.workspace.openUrl.mutationOptions());

  return useMemo(
    () => ({
      async searchEntities(query: string, types: MentionType[]): Promise<EditorEntity[]> {
        try {
          const results = await queryClient.query(
            trpc.search.search.queryOptions({ query, entityType: types, limit: 20 }),
          );
          return results.map(toEditorEntity);
        } catch {
          // a query search cannot read yet ("@(") finds nothing rather than failing the menu
          return [];
        }
      },
      // core checks the URL again and opens only http and https
      onOpenUrl: (url: string) => openUrl({ url }),
    }),
    [queryClient, openUrl],
  );
}

/**
 * A search result as the "@" menu's entity: its title as text, a task's status and a project's or
 * event's colour. Colours from core are untrusted, so one that isn't #rrggbb is left out and the
 * menu draws its default (docs/security/untrusted-content.md).
 */
export function toEditorEntity(result: SearchResult): EditorEntity {
  const color = hexColorSchema.safeParse(result.color);
  return {
    type: result.entityType,
    id: result.entityId,
    title: highlightToText(result.title),
    ...(result.status !== null && { status: result.status }),
    ...(color.success && { color: color.data }),
  };
}
