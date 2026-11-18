import { useCallback } from 'react';
import { RichTextEditor, type RichTextEditorProps } from '@renderer/editor/RichTextEditor';
import type { EditorHost } from '@renderer/editor/types';
import { useWorkspaceEditorHost } from '@renderer/editor/use-workspace-host';
import { useOpenEntity } from '../hooks/use-open-entity';

export type WorkspaceRichTextEditorProps = Omit<RichTextEditorProps, keyof EditorHost>;

/**
 * A page's RichTextEditor, acting in the open workspace: "@" searches it and links open through
 * `workspace.openUrl` (useWorkspaceEditorHost), and a pill opens its entity where it lives
 * (useOpenEntity; an event on its day, once its pill has loaded it). Every page's editor is one;
 * Storybook and the editor's tests render RichTextEditor with their own host.
 */
export function WorkspaceRichTextEditor(props: WorkspaceRichTextEditorProps) {
  const workspace = useWorkspaceEditorHost();
  const openEntity = useOpenEntity();
  const onOpenEntity = useCallback<NonNullable<EditorHost['onOpenEntity']>>(
    (_type, id, entity) => openEntity({ id, startAt: entity?.startAt }),
    [openEntity],
  );
  return <RichTextEditor {...props} {...workspace} onOpenEntity={onOpenEntity} />;
}
