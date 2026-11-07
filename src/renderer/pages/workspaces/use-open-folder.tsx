import { useState, type ReactNode } from 'react';
import { useNavigate } from '@tanstack/react-router';
import { useMutation } from '@tanstack/react-query';
import type { WorkspaceId } from '@common/ids';
import { trpc } from '../../ipc';
import { importFailure, type ImportFailure } from '../../workspace/errors';
import { ImportErrorDialog } from './ImportErrorDialog';

/**
 * "Open Existing Folder…" / "Open folder…": asks main for a folder (workspaces.importFolder adds
 * it to the list), then goes to the workspace, which opens it. A cancelled dialog does nothing;
 * a folder that can't be added shows why. Render `dialog` where the button is.
 */
export function useOpenFolder(): { run: () => void; pending: boolean; dialog: ReactNode } {
  const navigate = useNavigate();
  const [failure, setFailure] = useState<ImportFailure | null>(null);
  const goTo = (workspaceId: WorkspaceId) =>
    void navigate({ to: '/app/$workspaceId', params: { workspaceId } });
  const importFolder = useMutation(
    trpc.workspaces.importFolder.mutationOptions({
      onSuccess: (workspace) => {
        if (workspace) goTo(workspace.id);
      },
      onError: (error) => setFailure(importFailure(error)),
    }),
  );
  const run = () => importFolder.mutate();
  return {
    run,
    pending: importFolder.isPending,
    dialog: (
      <ImportErrorDialog
        failure={failure}
        onClose={() => setFailure(null)}
        onChooseAnother={run}
        onOpen={goTo}
      />
    ),
  };
}
