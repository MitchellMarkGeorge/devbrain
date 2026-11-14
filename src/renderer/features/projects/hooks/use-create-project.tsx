import { useCallback } from 'react';
import { useModals } from '@renderer/app/modals';
import { useOpenEntity } from '@renderer/shared/hooks/use-open-entity';
import { CreateProjectDialog } from '../components/create/CreateProjectDialog';

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
