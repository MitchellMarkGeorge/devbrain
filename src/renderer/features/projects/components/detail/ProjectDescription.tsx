import type { Project } from '@common/types';
import { RichTextEditor } from '@renderer/editor/RichTextEditor';
import { ipc } from '@renderer/ipc';
import { useEditorAutosave } from '@renderer/shared/hooks/use-autosave';
import { useEditorHost } from '@renderer/shared/hooks/use-editor-host';
import { useMutationErrorToast } from '@renderer/shared/lib/mutation-errors';
import { isSynced } from '@renderer/features/tasks/api/queries';
import styles from './ProjectPage.module.css';

/**
 * A project's description in the rich text editor, saved 500ms after typing stops and at once when
 * it unmounts (as a task's description is). Key it by the project's id, so a save still pending
 * goes to the project it was typed for. A synced project's description is its provider's: shown
 * read-only, and left out when empty.
 */
export function ProjectDescription({ project }: { project: Project }) {
  const host = useEditorHost();
  const showError = useMutationErrorToast();
  const synced = isSynced(project);
  const description = useEditorAutosave(project.description ?? '', (markdown) => {
    const blank = markdown.trim() === '';
    ipc.projects.update
      .mutate({ id: project.id, description: blank ? null : markdown })
      .catch((error: unknown) => showError(error, 'Couldn’t save the description'));
    // a blank description is stored as none, and comes back as ''
    return blank ? '' : markdown;
  });
  if (synced && !project.description) return null;
  return (
    <RichTextEditor
      {...host}
      className={styles.description}
      label="Description"
      value={description.value}
      editable={!synced}
      placeholder="Add a description…"
      onChange={description.onChange}
    />
  );
}
