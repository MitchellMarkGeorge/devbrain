import { useCallback } from 'react';
import { RichTextEditor, type RichTextEditorProps } from '@renderer/editor/RichTextEditor';
import type { EditorHost } from '@renderer/editor/types';
import { useOpenEntity } from '../hooks/use-open-entity';
import { useWorkspaceEditorHost, type NewTaskOptions } from '../hooks/use-workspace-editor-host';
import { WorkspaceEntityPill } from './WorkspaceEntityPill';

export interface WorkspaceRichTextEditorProps extends Omit<
  RichTextEditorProps,
  keyof EditorHost | 'entityPill'
> {
  // where a task made from the selected text (Turn into task) goes: the page's project, its note
  newTaskOptions?: NewTaskOptions;
}

/**
 * A page's RichTextEditor, acting in the open workspace: its pills show their entities as the
 * workspace holds them now (WorkspaceEntityPill), "@" searches it and links open through
 * `workspace.openUrl` (useWorkspaceEditorHost), and a pill opens its entity where it lives
 * (useOpenEntity; an event on its day, once its pill has loaded it). Selected text turns into a
 * task, made in `newTaskOptions`'s project and note and linked in its place. Every page's editor is one;
 * Storybook and the editor's tests render RichTextEditor with their own host.
 */
export function WorkspaceRichTextEditor({
  newTaskOptions,
  ...props
}: WorkspaceRichTextEditorProps) {
  const workspace = useWorkspaceEditorHost(newTaskOptions);
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
