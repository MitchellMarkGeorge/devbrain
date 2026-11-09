import { useCallback } from 'react';
import type { TaskSummary } from '@common/types';
import { useModals } from '../../modals';
import { useOpenEntity } from '../app/use-open-entity';
import { CreateTaskDialog, type CreateTaskDefaults } from './CreateTaskDialog';

export interface CreateTaskOptions {
  /** a subtask of this task */
  parent?: TaskSummary;
  defaults?: CreateTaskDefaults;
}

/**
 * Opens the Create task dialog (or Create subtask, with `parent`): C anywhere, the sidebar's New
 * task, the tasks page's New Task, a board column's "Add task", a task page's Subtasks "+ Add".
 */
export function useCreateTask(): (options?: CreateTaskOptions) => void {
  const modals = useModals();
  const openEntity = useOpenEntity();
  return useCallback(
    (options = {}) => {
      modals.open((props) => (
        <CreateTaskDialog {...props} {...options} onOpenTask={(id) => openEntity({ id })} />
      ));
    },
    [modals, openEntity],
  );
}
