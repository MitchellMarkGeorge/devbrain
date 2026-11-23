import { useQuery } from '@tanstack/react-query';
import type { Task } from '@common/types';
import { ipc } from '@renderer/ipc';
import { taskContentQuery } from '@renderer/shared/api/content';
import { WorkspaceRichTextEditor } from '@renderer/shared/components/WorkspaceRichTextEditor';
import { useEditorAutosave } from '@renderer/shared/hooks/use-autosave';
import { useMutationErrorToast } from '@renderer/shared/lib/mutation-errors';
import { isSynced } from '../../api/queries';
import { useCreateTask } from '../../hooks/use-create-task';

/**
 * A task's description in the rich text editor, read from its content query (primed by the task
 * page's loader), saved 500ms after typing stops and at once when it unmounts: on the task page and
 * in the board's sheet. Key it by the task's id, so a save still pending goes to the task it was
 * typed for. A synced task's description is its provider's: shown read-only, and left out when it
 * has none.
 */
export function TaskDescription({ task, className }: { task: Task; className?: string }) {
  const content = useQuery(taskContentQuery(task.id));
  if (content.data === undefined) return null;
  return <TaskDescriptionLoaded task={task} content={content.data} className={className} />;
}

function TaskDescriptionLoaded({
  task,
  content,
  className,
}: {
  task: Task;
  content: string;
  className?: string;
}) {
  const showError = useMutationErrorToast();
  const createTask = useCreateTask();
  const synced = isSynced(task);
  const description = useEditorAutosave(taskContentQuery(task.id).queryKey, content, (markdown) => {
    const blank = markdown.trim() === '';
    ipc.tasks.update
      .mutate({ id: task.id, description: blank ? null : markdown })
      .catch((error: unknown) => showError(error, 'Couldn’t save the description'));
    // a blank description is stored as none, and comes back as ''
    return blank ? '' : markdown;
  });
  if (synced && !content) return null;
  return (
    <WorkspaceRichTextEditor
      className={className}
      label="Description"
      initialValue={description.initialValue}
      onReady={description.onReady}
      editable={!synced}
      placeholder="Add a description…"
      onChange={description.onChange}
      newTaskOptions={{ projectId: task.projectId }}
      openNewTaskDialog={createTask}
    />
  );
}
