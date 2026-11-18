import { useCallback } from 'react';
import type { Task, TaskSummary } from '@common/types';
import { useModals } from '@renderer/app/modals';
import { useOpenEntity } from '@renderer/shared/hooks/use-open-entity';
import { CreateTaskDialog, type CreateTaskDefaults } from '../components/create/CreateTaskDialog';

export interface CreateTaskOptions {
  /** a subtask of this task */
  parent?: TaskSummary;
  defaults?: CreateTaskDefaults;
  /** each task created (several with "Create more") */
  onCreated?: (task: Task) => void;
  /** the dialog started closing, created or not */
  onClosed?: () => void;
}

/**
 * Opens the Create task dialog (or Create subtask, with `parent`): C anywhere, the sidebar's New
 * task, the tasks page's New Task, a board column's "Add task", a task page's Subtasks "+ Add",
 * the editor's "/task" on an empty line (through the workspace layout).
 */
export function useCreateTask(): (options?: CreateTaskOptions) => void {
  const modals = useModals();
  const openEntity = useOpenEntity();
  return useCallback(
    ({ onClosed, ...options } = {}) => {
      modals.open((props) => (
        <CreateTaskDialog
          {...props}
          {...options}
          onOpenChange={(open) => {
            props.onOpenChange(open);
            if (!open) onClosed?.();
          }}
          onOpenTask={(id) => openEntity({ id })}
        />
      ));
    },
    [modals, openEntity],
  );
}
