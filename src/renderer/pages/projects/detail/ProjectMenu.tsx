import { Circle, Code, Plus, SquarePen, Trash2 } from 'lucide-react';
import type { Project } from '@common/types';
import {
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  PageMenuButton,
} from '../../../components';
import { ipc } from '../../../ipc';
import { useMutationErrorToast } from '../../app/mutation-errors';
import { useOpenEntity } from '../../app/use-open-entity';
import { useCreateTask } from '../../tasks/create/use-create-task';
import { isSynced } from '../../tasks/queries';
import { ColourItems } from '../colour';
import type { ProjectActions } from '../use-project-actions';

export interface ProjectMenuProps {
  project: Project;
  actions: ProjectActions;
  onTrash: () => void;
}

/**
 * The project page's "…" menu (Figma `7424:40578`): New task and New note, both in the project;
 * Change colour ›; Copy as Markdown (C3, not built yet: drawn disabled); then Move to trash. A
 * synced project's colour is its provider's, and it can't be trashed (it leaves with its source).
 */
export function ProjectMenu({ project, actions, onTrash }: ProjectMenuProps) {
  const createTask = useCreateTask();
  const openEntity = useOpenEntity();
  const showError = useMutationErrorToast();
  const synced = isSynced(project);

  const newNote = () =>
    ipc.notes.create
      .mutate({ projectId: project.id })
      .then((note) => openEntity({ id: note.id }))
      .catch((error: unknown) => showError(error, 'Couldn’t create the note'));

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
      <DropdownMenuItem icon={Code} disabled>
        Copy as Markdown
      </DropdownMenuItem>
      <DropdownMenuSeparator />
      <DropdownMenuItem icon={Trash2} variant="destructive" disabled={synced} onClick={onTrash}>
        Move to trash
      </DropdownMenuItem>
    </PageMenuButton>
  );
}
