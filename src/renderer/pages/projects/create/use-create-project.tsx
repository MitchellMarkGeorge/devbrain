import { useCallback } from 'react';
import { useModals } from '../../../modals';
import { useOpenEntity } from '../../app/use-open-entity';
import { CreateProjectDialog } from './CreateProjectDialog';

/**
 * Opens the Create project dialog: the projects page's New Project, its empty state, and the app's
 * "New project" command. The new project opens once it is created.
 */
export function useCreateProject(): () => void {
  const modals = useModals();
  const openEntity = useOpenEntity();
  return useCallback(() => {
    modals.open((props) => (
      <CreateProjectDialog {...props} onCreated={(id) => openEntity({ id })} />
    ));
  }, [modals, openEntity]);
}
