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
import { useCreateNote } from '../../notes/use-create-note';
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
  const synced = isSynced(project);

  const createNote = useCreateNote();
  const newNote = () => createNote({ projectId: project.id });

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
