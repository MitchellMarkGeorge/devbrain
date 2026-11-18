import { useMutation, useQueryClient } from '@tanstack/react-query';
import { createContext, useContext, useMemo } from 'react';
import { hexColorSchema } from '@common/color';
import type { NoteId, ProjectId } from '@common/ids';
import type { SearchResult, Task } from '@common/types';
import { ipc, trpc } from '@renderer/ipc';
import type { EditorEntity, EditorHost, MentionType } from '@renderer/editor/types';
import { useMutationErrorToast } from '../lib/mutation-errors';
import { defaultDueDate } from '../lib/task-defaults';

/**
 * Where a task made from an editor's text goes: the project of the page it was written on, and
 * the note it was written in (`tasks.linkedNoteId`, so the note lists it).
 */
export interface NewTaskOptions {
  projectId?: ProjectId | null;
  linkedNoteId?: NoteId;
}

/**
 * Opens the New task dialog for an editor (its "/task" on an empty line), filled in with the
 * editor's project and note; `onCreated` hears each task made, `onClosed` the dialog closing.
 */
export type OpenNewTaskDialog = (request: {
  defaults: NewTaskOptions;
  onCreated: (task: Task) => void;
  onClosed: () => void;
}) => void;

/**
 * The New task dialog's opener, given by the workspace layout (AppLayout), which can reach the
 * tasks feature that `shared` doesn't import. Without it, an editor's "/task" needs text to use.
 */
export const NewTaskDialogContext = createContext<OpenNewTaskDialog | null>(null);

/**
 * The editor host's "@" search over the open workspace, opening links and Turn into task, for
 * WorkspaceRichTextEditor (../components), which adds onOpenEntity from the router. A task made
 * from text takes the settings' default priority and due date, as the New task dialog does, and
 * `newTaskOptions`'s project and note. "/task" on an empty line opens the New task dialog with the same
 * project and note (NewTaskDialogContext).
 */
export function useWorkspaceEditorHost(
  newTaskOptions: NewTaskOptions = {},
): Pick<EditorHost, 'searchEntities' | 'onOpenUrl' | 'createTask' | 'openNewTask'> {
  const openNewTaskDialog = useContext(NewTaskDialogContext);
  const queryClient = useQueryClient();
  const { mutate: openUrl } = useMutation(trpc.workspace.openUrl.mutationOptions());
  const showError = useMutationErrorToast('Couldn’t create the task');
  const { projectId, linkedNoteId } = newTaskOptions;

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
      async createTask(title: string): Promise<EditorEntity | null> {
        try {
          const settings = await queryClient.query(trpc.settings.get.queryOptions());
          const task = await ipc.tasks.create.mutate({
            title,
            priority: settings.tasks.defaultPriority,
            dueDate: defaultDueDate(settings.tasks.defaultDueDate, new Date()),
            projectId: projectId ?? undefined,
            linkedNoteId,
          });
          return { type: 'task', id: task.id, title: task.title, status: task.status };
        } catch (error) {
          showError(error);
          return null;
        }
      },
      openNewTask: openNewTaskDialog
        ? ({ onCreated, onClosed }) =>
            openNewTaskDialog({
              defaults: { projectId, linkedNoteId },
              onCreated: (task) =>
                onCreated({ type: 'task', id: task.id, title: task.title, status: task.status }),
              onClosed,
            })
        : undefined,
    }),
    [queryClient, openUrl, showError, projectId, linkedNoteId, openNewTaskDialog],
  );
}

/**
 * A search result as the "@" menu's entity, read from the entity it found: its title, a task's
 * status and a project's or event's own colour. Colours from core are untrusted, so one that isn't
 * #rrggbb is left out and the menu draws its default (docs/security/untrusted-content.md).
 */
export function toEditorEntity(result: SearchResult): EditorEntity {
  const { entity } = result;
  const color = hexColorSchema.safeParse(
    result.entityType === 'project' || result.entityType === 'event' ? result.entity.color : null,
  );
  return {
    type: result.entityType,
    id: entity.id,
    title: entity.title,
    ...(result.entityType === 'task' && { status: result.entity.status }),
    ...(color.success && { color: color.data }),
  };
}
