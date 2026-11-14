import { useNavigate } from '@tanstack/react-router';
import { useMutation } from '@tanstack/react-query';
import type { WorkspaceId } from '@common/ids';
import { trpc } from '@renderer/ipc';
import { useModals } from '@renderer/app/modals';
import { importFailure } from '@renderer/shared/lib/workspace/errors';
import { ImportErrorDialog } from '../components/ImportErrorDialog';

/**
 * "Open Existing Folder…" / "Open folder…": asks main for a folder (workspaces.importFolder adds
 * it to the list), then goes to the workspace, which opens it. A cancelled dialog does nothing;
 * a folder that can't be added shows why, in a dialog (`useModals`).
 */
export function useOpenFolder(): { run: () => void; pending: boolean } {
  const navigate = useNavigate();
  const modals = useModals();
  const goTo = (workspaceId: WorkspaceId) =>
    void navigate({ to: '/app/$workspaceId', params: { workspaceId } });
  const importFolder = useMutation(
    trpc.workspaces.importFolder.mutationOptions({
      onSuccess: (workspace) => {
        if (workspace) goTo(workspace.id);
      },
      onError: (error) => {
        const failure = importFailure(error);
        modals.open((props) => (
          <ImportErrorDialog {...props} failure={failure} onChooseAnother={run} onOpen={goTo} />
        ));
      },
    }),
  );
  function run() {
    importFolder.mutate();
  }
  return { run, pending: importFolder.isPending };
}
