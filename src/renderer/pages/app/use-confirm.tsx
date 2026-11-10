import { useCallback } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ConfirmDialog, type ConfirmDialogProps } from '../../components';
import { trpc } from '../../ipc';
import { KeyScope } from '../../keyboard';
import { useModals } from '../../modals';

/**
 * Which setting decides whether to ask: `archive` (moving to trash) follows
 * `general.confirmBeforeArchiving`, `delete` (deleting for good) `general.confirmBeforeDeleting`.
 */
export type ConfirmKind = 'archive' | 'delete';

export type ConfirmOptions = Pick<
  ConfirmDialogProps,
  'title' | 'description' | 'actionLabel' | 'irreversible' | 'confirmText' | 'cancelLabel'
> & { kind: ConfirmKind };

/**
 * Asks before a destructive action, as the settings say: resolves `true` at once when the
 * matching setting is off (core never reads them), else shows a `ConfirmDialog` and resolves with
 * the user's answer (`false` for Cancel or Esc). A dialog dropped by a switch of workspace never
 * answers, and its action never runs.
 *
 * `if (!(await confirm({ kind: 'delete', title: 'Delete task permanently?', … }))) return;`
 */
export function useConfirm(): (options: ConfirmOptions) => Promise<boolean> {
  const modals = useModals();
  const general = useQuery(trpc.settings.get.queryOptions()).data?.general;
  const askArchive = general?.confirmBeforeArchiving ?? false;
  const askDelete = general?.confirmBeforeDeleting ?? true;
  return useCallback(
    ({ kind, ...dialog }) => {
      if (!(kind === 'archive' ? askArchive : askDelete)) return Promise.resolve(true);
      return new Promise<boolean>((resolve) => {
        let confirmed = false;
        modals.open((props) => (
          <ConfirmDialog
            {...props}
            {...dialog}
            onConfirm={() => {
              confirmed = true;
            }}
            onOpenChange={(open) => {
              props.onOpenChange(open);
              if (!open) resolve(confirmed);
            }}
          >
            {/* a modal key scope: nothing outside the dialog fires while it is open */}
            <KeyScope name="dialog" />
          </ConfirmDialog>
        ));
      });
    },
    [modals, askArchive, askDelete],
  );
}
