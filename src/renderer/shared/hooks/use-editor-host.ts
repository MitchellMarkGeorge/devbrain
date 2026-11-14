import { useMemo } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { isId } from '@common/ids';
import type { EditorHost } from '@renderer/editor/types';
import { useEntityResolver } from '@renderer/editor/use-entity-resolver';
import { useWorkspaceEditorHost } from '@renderer/editor/use-workspace-host';
import { trpc } from '@renderer/ipc';
import { useOpenEntity } from './use-open-entity';

/**
 * Everything a page's `RichTextEditor` needs from the app: "@" search and links
 * (`useWorkspaceEditorHost`), its pills' entities (`useEntityResolver`), and opening a pill's
 * entity where it lives (`useOpenEntity`; an event on its day, when its pill has loaded it).
 * Spread it onto the editor: `<RichTextEditor {...host} />`.
 */
export function useEditorHost(): EditorHost {
  const queryClient = useQueryClient();
  const workspace = useWorkspaceEditorHost();
  const resolver = useEntityResolver();
  const openEntity = useOpenEntity();
  return useMemo(
    () => ({
      ...workspace,
      ...resolver,
      onOpenEntity: (_type, id) =>
        openEntity({
          id,
          startAt: isId('event', id)
            ? queryClient.getQueryData(trpc.events.get.queryKey({ id }))?.startAt
            : undefined,
        }),
    }),
    [queryClient, workspace, resolver, openEntity],
  );
}
