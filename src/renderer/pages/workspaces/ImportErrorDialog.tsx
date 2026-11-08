import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  Button,
} from '../../components';
import type { WorkspaceId } from '@common/ids';
import type { ModalProps } from '../../modals';
import type { ImportFailure } from '../../workspace/errors';

/**
 * Why a folder couldn't be added (Figma 7423:37060–7423:37281): not a workspace, already in the
 * list (with Open It), needs a newer DevBrain, unreadable. Cancel, or the way forward. Shown with
 * `useModals`.
 */
export function ImportErrorDialog({
  failure,
  onChooseAnother,
  onOpen,
  ...props
}: ModalProps & {
  failure: ImportFailure;
  onChooseAnother: () => void;
  onOpen: (id: WorkspaceId) => void;
}) {
  const onClose = () => props.onOpenChange(false);
  return (
    <AlertDialog {...props}>
      <AlertDialogContent data-testid="import-error">
        <AlertDialogHeader>
          <AlertDialogTitle>{failure.title}</AlertDialogTitle>
          <AlertDialogDescription>{failure.description}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          {failure.alreadyAdded !== null ? (
            <Button
              onClick={() => {
                onClose();
                onOpen(failure.alreadyAdded!);
              }}
            >
              Open It
            </Button>
          ) : (
            failure.chooseAnother && (
              <Button
                onClick={() => {
                  onClose();
                  onChooseAnother();
                }}
              >
                Choose Another Folder
              </Button>
            )
          )}
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
