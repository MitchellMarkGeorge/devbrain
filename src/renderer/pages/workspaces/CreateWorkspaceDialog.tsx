import { Button, Dialog, DialogClose, DialogContent, DialogFooter } from '../../components';
import { CreateWorkspaceForm } from './CreateWorkspaceForm';

/**
 * "New workspace…" inside the app (Figma 7760:61769): the form in a dialog, saying up front that the
 * new workspace opens once it is created, as that closes the page under it.
 */
export function CreateWorkspaceDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent showClose={false} aria-label="New workspace">
        {open && (
          <CreateWorkspaceForm
            title="New workspace"
            description="A workspace is a folder with its own tasks, notes and connected accounts. It opens once it’s created."
            tileSize={40}
          >
            {({ fields, formId, canSubmit }) => (
              <>
                {fields}
                <DialogFooter>
                  <DialogClose render={<Button variant="ghost" />}>Cancel</DialogClose>
                  <Button type="submit" form={formId} disabled={!canSubmit}>
                    Create Workspace
                  </Button>
                </DialogFooter>
              </>
            )}
          </CreateWorkspaceForm>
        )}
      </DialogContent>
    </Dialog>
  );
}
