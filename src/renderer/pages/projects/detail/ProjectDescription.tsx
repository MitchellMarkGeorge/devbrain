import type { Project } from '@common/types';
import { RichTextEditor } from '../../../editor/RichTextEditor';
import { useWorkspaceEditorHost } from '../../../editor/use-workspace-host';
import { ipc } from '../../../ipc';
import { useMutationErrorToast } from '../../app/mutation-errors';
import { useOpenEntity } from '../../app/use-open-entity';
import { isSynced } from '../../tasks/queries';
import { useAutosave } from '../../tasks/sections/TaskPageAutosave';
import styles from './ProjectPage.module.css';

/**
 * A project's description in the rich text editor, saved 500ms after typing stops and at once when
 * it unmounts. Key it by the project's id, so a save still pending goes to the project it was typed
 * for. A synced project's description is its provider's: shown read-only, and left out when empty.
 */
export function ProjectDescription({ project }: { project: Project }) {
  const host = useWorkspaceEditorHost();
  const openEntity = useOpenEntity();
  const showError = useMutationErrorToast();
  const synced = isSynced(project);
  const description = useAutosave((markdown: string) => {
    ipc.projects.update
      .mutate({ id: project.id, description: markdown.trim() === '' ? null : markdown })
      .catch((error: unknown) => showError(error, 'Couldn’t save the description'));
  });
  if (synced && !project.description) return null;
  return (
    <RichTextEditor
      {...host}
      className={styles.description}
      label="Description"
      value={project.description ?? ''}
      editable={!synced}
      placeholder="Add a description…"
      onChange={description.schedule}
      onOpenEntity={(_type, id) => openEntity({ id })}
    />
  );
}
