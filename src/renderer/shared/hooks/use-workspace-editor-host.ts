import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useMemo } from 'react';
import { hexColorSchema } from '@common/color';
import type { NoteId, ProjectId } from '@common/ids';
import type { SearchResult } from '@common/types';
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
 * Opens the New task dialog for an editor's "/task", filled in with the editor's project and note
 * and, when the line had text, that text as the title. A page passes the tasks feature's
 * `useCreateTask()`, which `shared` doesn't import.
 */
export type OpenNewTaskDialog = (options: {
  defaults: NewTaskOptions & { title?: string };
}) => void;

/**
 * The editor host's "@" search over the open workspace, opening links and Turn into task, for
 * WorkspaceRichTextEditor (../components), which adds onOpenEntity from the router. A task made
 * from text takes the settings' default priority and due date, as the New task dialog does, and
 * `newTaskOptions`'s project and note. "/task" opens the New task dialog through
 * `openNewTaskDialog`, with the same project and note; without one there is no "/task".
 */
export function useWorkspaceEditorHost(
  newTaskOptions: NewTaskOptions = {},
  openNewTaskDialog?: OpenNewTaskDialog,
): Pick<EditorHost, 'searchEntities' | 'onOpenUrl' | 'createTask' | 'openNewTask'> {
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
        ? (title?: string) => openNewTaskDialog({ defaults: { title, projectId, linkedNoteId } })
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
