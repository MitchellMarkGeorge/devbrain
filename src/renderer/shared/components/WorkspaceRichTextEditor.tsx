import { useCallback } from 'react';
import { RichTextEditor, type RichTextEditorProps } from '@renderer/editor/RichTextEditor';
import type { EditorHost } from '@renderer/editor/types';
import { useOpenEntity } from '../hooks/use-open-entity';
import { useWorkspaceEditorHost } from '../hooks/use-workspace-editor-host';
import { WorkspaceEntityPill } from './WorkspaceEntityPill';

export type WorkspaceRichTextEditorProps = Omit<
  RichTextEditorProps,
  keyof EditorHost | 'entityPill'
>;

/**
 * A page's RichTextEditor, acting in the open workspace: its pills show their entities as the
 * workspace holds them now (WorkspaceEntityPill), "@" searches it and links open through
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
  return (
    <RichTextEditor
      {...props}
      {...workspace}
      entityPill={WorkspaceEntityPill}
      onOpenEntity={onOpenEntity}
    />
  );
}
