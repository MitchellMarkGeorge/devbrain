import type { Task } from '@common/types';
import { RichTextEditor } from '../../editor/RichTextEditor';
import { useWorkspaceEditorHost } from '../../editor/use-workspace-host';
import { ipc } from '../../ipc';
import { useMutationErrorToast } from '../app/mutation-errors';
import { useOpenEntity } from '../app/use-open-entity';
import { isSynced } from './queries';
import { useAutosave } from './TaskPageAutosave';

/**
 * A task's description in the rich text editor, saved 500ms after typing stops and at once when it
 * unmounts: on the task page and in the board's sheet. Key it by the task's id, so a save still
 * pending goes to the task it was typed for. A synced task's description is its provider's: shown
 * read-only, and left out when it has none.
 */
export function TaskDescription({ task, className }: { task: Task; className?: string }) {
  const host = useWorkspaceEditorHost();
  const openEntity = useOpenEntity();
  const showError = useMutationErrorToast();
  const synced = isSynced(task);
  const description = useAutosave((markdown: string) => {
    ipc.tasks.update
      .mutate({ id: task.id, description: markdown.trim() === '' ? null : markdown })
      .catch((error: unknown) => showError(error, 'Couldn’t save the description'));
  });
  if (synced && !task.description) return null;
  return (
    <RichTextEditor
      {...host}
      className={className}
      label="Description"
      value={task.description ?? ''}
      editable={!synced}
      placeholder="Add a description…"
      onChange={description.schedule}
      onOpenEntity={(_type, id) => openEntity({ id })}
    />
  );
}
