import { useQueryClient } from '@tanstack/react-query';
import type { Task } from '@common/types';
import { ipc, trpc } from '@renderer/ipc';
import { WorkspaceRichTextEditor } from '@renderer/shared/components/WorkspaceRichTextEditor';
import { holdSavedText, useEditorAutosave } from '@renderer/shared/hooks/use-autosave';
import { useMutationErrorToast } from '@renderer/shared/lib/mutation-errors';
import { isSynced } from '../../api/queries';
import { useCreateTask } from '../../hooks/use-create-task';

/**
 * A task's description in the rich text editor, saved 500ms after typing stops and at once when it
 * unmounts: on the task page and in the board's sheet. Key it by the task's id, so a save still
 * pending goes to the task it was typed for. A synced task's description is its provider's: shown
 * read-only, and left out when it has none.
 */
export function TaskDescription({ task, className }: { task: Task; className?: string }) {
  const showError = useMutationErrorToast();
  const createTask = useCreateTask();
  const synced = isSynced(task);
  const queryClient = useQueryClient();
  const { initialValue, editor, onChange } = useEditorAutosave(
    task.description ?? '',
    (markdown) => {
      // a blank description is stored as none
      const description = markdown.trim() === '' ? null : markdown;
      holdSavedText(queryClient, trpc.tasks.get.queryKey({ id: task.id }), (cached) => ({
        ...cached,
        description,
      }));
      ipc.tasks.update
        .mutate({ id: task.id, description })
        .catch((error: unknown) => showError(error, 'Couldn’t save the description'));
    },
  );
  if (synced && !task.description) return null;
  return (
    <WorkspaceRichTextEditor
      className={className}
      label="Description"
      initialValue={initialValue}
      ref={editor}
      editable={!synced}
      placeholder="Add a description…"
      onChange={onChange}
      newTaskOptions={{ projectId: task.projectId }}
      openNewTaskDialog={createTask}
    />
  );
}
