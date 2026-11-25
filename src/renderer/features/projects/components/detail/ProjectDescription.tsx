import { useQueryClient } from '@tanstack/react-query';
import type { Project } from '@common/types';
import { ipc, trpc } from '@renderer/ipc';
import { WorkspaceRichTextEditor } from '@renderer/shared/components/WorkspaceRichTextEditor';
import { writeSaveToCache, useEditorAutosave } from '@renderer/shared/hooks/use-autosave';
import { useMutationErrorToast } from '@renderer/shared/lib/mutation-errors';
import { isSynced } from '@renderer/features/tasks/api/queries';
import { useCreateTask } from '@renderer/features/tasks/hooks/use-create-task';
import styles from './ProjectPage.module.css';

/**
 * A project's description in the rich text editor, saved 500ms after typing stops and at once when
 * it unmounts (as a task's description is). Key it by the project's id, so a save still pending
 * goes to the project it was typed for. A synced project's description is its provider's: shown
 * read-only, and left out when empty.
 */
export function ProjectDescription({ project }: { project: Project }) {
  const showError = useMutationErrorToast();
  const createTask = useCreateTask();
  const synced = isSynced(project);
  const queryClient = useQueryClient();
  const { initialValue, editor, onChange } = useEditorAutosave(
    project.description ?? '',
    (markdown) => {
      // a blank description is stored as none
      const description = markdown.trim() === '' ? null : markdown;
      writeSaveToCache(queryClient, trpc.projects.get.queryKey({ id: project.id }), (cached) => ({
        ...cached,
        description,
      }));
      ipc.projects.update
        .mutate({ id: project.id, description })
        .catch((error: unknown) => showError(error, 'Couldn’t save the description'));
    },
  );
  if (synced && !project.description) return null;
  return (
    <WorkspaceRichTextEditor
      className={styles.description}
      label="Description"
      initialValue={initialValue}
      ref={editor}
      editable={!synced}
      placeholder="Add a description…"
      onChange={onChange}
      newTaskOptions={{ projectId: project.id }}
      openNewTaskDialog={createTask}
    />
  );
}
