import type { MentionSourceId } from '@common/types';
import { forwardRef, useCallback } from 'react';
import {
  RichTextEditor,
  type RichTextEditorHandle,
  type RichTextEditorProps,
} from '@renderer/editor/RichTextEditor';
import type { EditorHost } from '@renderer/editor/types';
import { useOpenEntity } from '../hooks/use-open-entity';
import {
  useWorkspaceEditorHost,
  type NewTaskOptions,
  type OpenNewTaskDialog,
} from '../hooks/use-workspace-editor-host';
import { WorkspaceEntityPill } from './WorkspaceEntityPill';

export interface WorkspaceRichTextEditorProps extends Omit<
  RichTextEditorProps,
  keyof EditorHost | 'entityPill'
> {
  // the task, project, note or event whose text this is: "@" leaves it out, as nothing mentions
  // itself
  ownerId: MentionSourceId;
  // where a task made from the editor goes (Turn into task, "/task"): the page's project, its note
  newTaskOptions?: NewTaskOptions;
  // opens New task for "/task": the tasks feature's useCreateTask(); without it there is no "/task"
  openNewTaskDialog?: OpenNewTaskDialog;
}

/**
 * A page's RichTextEditor, acting in the open workspace: its pills show their entities as the
 * workspace holds them now (WorkspaceEntityPill), "@" searches it and links open through
 * `workspace.openUrl` (useWorkspaceEditorHost), and a pill opens its entity where it lives
 * (useOpenEntity; an event on its day, once its pill has loaded it). Selected text turns into a
 * task, made in `newTaskOptions`'s project and note and linked in its place, and "/task" opens New
 * task (`openNewTaskDialog`) with them filled in. Every page's editor is one;
 * Storybook and the editor's tests render RichTextEditor with their own host.
 */
export const WorkspaceRichTextEditor = forwardRef<
  RichTextEditorHandle,
  WorkspaceRichTextEditorProps
>(function WorkspaceRichTextEditor({ ownerId, newTaskOptions, openNewTaskDialog, ...props }, ref) {
  const workspace = useWorkspaceEditorHost({ ownerId, newTaskOptions, openNewTaskDialog });
  const openEntity = useOpenEntity();
  const onOpenEntity = useCallback<NonNullable<EditorHost['onOpenEntity']>>(
    (_type, id, entity) => openEntity({ id, startAt: entity?.startAt }),
    [openEntity],
  );
  return (
    <RichTextEditor
      {...props}
      {...workspace}
      ref={ref}
      entityPill={WorkspaceEntityPill}
      onOpenEntity={onOpenEntity}
    />
  );
});
