import type { Task } from '@common/types';
import { RichTextEditor } from '../../../editor/RichTextEditor';
import { ipc } from '../../../ipc';
import { useEditorAutosave } from '../../app/autosave';
import { useEditorHost } from '../../app/use-editor-host';
import { useMutationErrorToast } from '../../app/mutation-errors';
import { isSynced } from '../queries';

/**
 * A task's description in the rich text editor, saved 500ms after typing stops and at once when it
 * unmounts: on the task page and in the board's sheet. Key it by the task's id, so a save still
 * pending goes to the task it was typed for. A synced task's description is its provider's: shown
 * read-only, and left out when it has none.
 */
export function TaskDescription({ task, className }: { task: Task; className?: string }) {
  const host = useEditorHost();
  const showError = useMutationErrorToast();
  const synced = isSynced(task);
  const description = useEditorAutosave(task.description ?? '', (markdown) => {
    const blank = markdown.trim() === '';
    ipc.tasks.update
      .mutate({ id: task.id, description: blank ? null : markdown })
      .catch((error: unknown) => showError(error, 'Couldn’t save the description'));
    // a blank description is stored as none, and comes back as ''
    return blank ? '' : markdown;
  });
  if (synced && !task.description) return null;
  return (
    <RichTextEditor
      {...host}
      className={className}
      label="Description"
      value={description.value}
      editable={!synced}
      placeholder="Add a description…"
      onChange={description.onChange}
    />
  );
}
