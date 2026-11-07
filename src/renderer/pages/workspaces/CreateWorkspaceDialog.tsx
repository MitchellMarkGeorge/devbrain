import { useNavigate } from '@tanstack/react-router';
import { Dialog, DialogContent, DialogTitle } from '../../components';
import { CreateWorkspaceForm } from './CreateWorkspaceForm';
import styles from './CreateWorkspaceForm.module.css';

/**
 * "New workspace…" inside the app (Figma 7760:61527): the Create workspace form in a dialog over
 * the page. Creating goes to the new workspace, which opens it under the splash.
 */
export function CreateWorkspaceDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const navigate = useNavigate();
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
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
