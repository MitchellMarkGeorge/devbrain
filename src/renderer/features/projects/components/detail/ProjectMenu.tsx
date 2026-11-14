import { Circle, Code, Plus, SquarePen, Trash2 } from 'lucide-react';
import type { Project } from '@common/types';
import {
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  PageMenuButton,
  toast,
} from '@renderer/components';
import { ipc } from '@renderer/ipc';
import { useMutationErrorToast } from '@renderer/shared/lib/mutation-errors';
import { useCreateNote } from '@renderer/features/notes/hooks/use-create-note';
import { useCreateTask } from '@renderer/features/tasks/hooks/use-create-task';
import { isSynced } from '@renderer/features/tasks/api/queries';
import { ColourItems } from '../colour';
import type { ProjectActions } from '../../hooks/use-project-actions';

export interface ProjectMenuProps {
  project: Project;
  actions: ProjectActions;
  onTrash: () => void;
}

/**
 * The project page's "…" menu (Figma `7424:40578`): New task and New note, both in the project;
 * Change colour ›; Copy as Markdown (C3); then Move to trash. A
 * synced project's colour is its provider's, and it can't be trashed (it leaves with its source).
 */
export function ProjectMenu({ project, actions, onTrash }: ProjectMenuProps) {
  const createTask = useCreateTask();
  const synced = isSynced(project);

  const showError = useMutationErrorToast();
  const createNote = useCreateNote();
  const newNote = () => createNote({ projectId: project.id });

  // the project with its tasks grouped by status (C3), as the task page copies a task
  const copyAsMarkdown = () =>
    ipc.projects.toMarkdown
      .query({ id: project.id })
      .then((markdown) => navigator.clipboard.writeText(markdown))
      .then(() => toast({ tone: 'success', title: 'Copied' }))
      .catch((error: unknown) => showError(error, 'Couldn’t copy the project'));

  return (
    <PageMenuButton>
      <DropdownMenuItem
        icon={Plus}
        onClick={() => createTask({ defaults: { projectId: project.id } })}
      >
        New task
      </DropdownMenuItem>
      <DropdownMenuItem icon={SquarePen} onClick={() => void newNote()}>
        New note
      </DropdownMenuItem>
      <DropdownMenuSub>
        <DropdownMenuSubTrigger icon={Circle} disabled={synced}>
          Change colour
        </DropdownMenuSubTrigger>
        <DropdownMenuSubContent width="sm">
          <ColourItems
            color={project.color}
            onChange={(color) => actions.update(project, { color })}
          />
        </DropdownMenuSubContent>
      </DropdownMenuSub>
      <DropdownMenuSeparator />
      <DropdownMenuItem icon={Code} onClick={() => void copyAsMarkdown()}>
        Copy as Markdown
      </DropdownMenuItem>
      <DropdownMenuSeparator />
      <DropdownMenuItem icon={Trash2} variant="destructive" disabled={synced} onClick={onTrash}>
        Move to trash
      </DropdownMenuItem>
    </PageMenuButton>
  );
}
