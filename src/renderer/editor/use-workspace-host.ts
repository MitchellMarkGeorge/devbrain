import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useMemo } from 'react';
import { trpc } from '../ipc';
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
          // query() rather than the deprecated fetchQuery; it doesn't retry, so a search that
          // fails falls through to no results at once
          const results = await queryClient.query(
            trpc.search.search.queryOptions({ query, entityType: types, limit: 20 }),
          );
          return results.map((result) => ({
            type: result.entityType,
            id: result.entityId,
            title: highlightToText(result.title),
          }));
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
