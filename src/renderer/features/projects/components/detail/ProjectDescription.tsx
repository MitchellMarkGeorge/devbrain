import { useQuery } from '@tanstack/react-query';
import type { Project } from '@common/types';
import { ipc } from '@renderer/ipc';
import { projectContentQuery } from '@renderer/shared/api/content';
import { WorkspaceRichTextEditor } from '@renderer/shared/components/WorkspaceRichTextEditor';
import { useEditorAutosave } from '@renderer/shared/hooks/use-autosave';
import { useMutationErrorToast } from '@renderer/shared/lib/mutation-errors';
import { isSynced } from '@renderer/features/tasks/api/queries';
import { useCreateTask } from '@renderer/features/tasks/hooks/use-create-task';
import styles from './ProjectPage.module.css';

/**
 * A project's description in the rich text editor, read from its content query (primed by the
 * project page's loader), saved 500ms after typing stops and at once when it unmounts (as a task's
 * description is). Key it by the project's id, so a save still pending goes to the project it was
 * typed for. A synced project's description is its provider's: shown read-only, and left out when
 * empty.
 */
export function ProjectDescription({ project }: { project: Project }) {
  const content = useQuery(projectContentQuery(project.id));
  if (content.data === undefined) return null;
  return <ProjectDescriptionLoaded project={project} content={content.data} />;
}

function ProjectDescriptionLoaded({ project, content }: { project: Project; content: string }) {
  const showError = useMutationErrorToast();
  const createTask = useCreateTask();
  const synced = isSynced(project);
  const queryKey = projectContentQuery(project.id).queryKey;
  const description = useEditorAutosave(queryKey, content, (markdown) => {
    const blank = markdown.trim() === '';
    ipc.projects.update
      .mutate({ id: project.id, description: blank ? null : markdown })
      .catch((error: unknown) => showError(error, 'Couldn’t save the description'));
    // a blank description is stored as none, and comes back as ''
    return blank ? '' : markdown;
  });
  if (synced && !content) return null;
  return (
    <WorkspaceRichTextEditor
      className={styles.description}
      label="Description"
      initialValue={description.initialValue}
      onReady={description.onReady}
      editable={!synced}
      placeholder="Add a description…"
      onChange={description.onChange}
      newTaskOptions={{ projectId: project.id }}
      openNewTaskDialog={createTask}
    />
  );
}
