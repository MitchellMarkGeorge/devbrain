import { useCallback } from 'react';
import { useModals } from '../../modals';
import { useOpenEntity } from '../app/use-open-entity';
import { useCreateTask } from '../tasks/create/use-create-task';
import { SearchDialog } from './SearchDialog';

/**
 * Opens ⌘K search: the `search.open` command (⌘K) and the sidebar's search button. A result opens
 * through `useOpenEntity`; "New Task" opens Create task with what was searched.
 */
export function useOpenSearch(): () => void {
  const modals = useModals();
  const openEntity = useOpenEntity();
  const createTask = useCreateTask();
  return useCallback(() => {
    modals.open((props) => (
      <SearchDialog
        {...props}
        onOpenEntity={openEntity}
        onNewTask={(title) => createTask({ defaults: { title } })}
      />
    ));
  }, [modals, openEntity, createTask]);
}
