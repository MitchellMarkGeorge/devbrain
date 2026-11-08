import { useNavigate } from '@tanstack/react-router';
import { Dialog, DialogContent, DialogTitle } from '../../components';
import type { ModalProps } from '../../modals';
import { CreateWorkspaceForm } from './CreateWorkspaceForm';
import styles from './CreateWorkspaceForm.module.css';

/**
 * "New workspace…" inside the app (Figma 7760:61527): the Create workspace form in a dialog over
 * the page, shown with `useModals`. Creating goes to the new workspace, which opens it under the
 * splash.
 */
export function CreateWorkspaceDialog(props: ModalProps) {
  const { open, onOpenChange } = props;
  const navigate = useNavigate();
  return (
    <Dialog {...props}>
      <DialogContent size="form" showClose={false}>
        {open && (
          <CreateWorkspaceForm
            layout="dialog"
            title={<DialogTitle className={styles.title}>New workspace</DialogTitle>}
            onCancel={() => onOpenChange(false)}
            onCreated={(workspace) => {
              onOpenChange(false);
              void navigate({ to: '/app/$workspaceId', params: { workspaceId: workspace.id } });
            }}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}
