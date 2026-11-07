import { createContext, useContext, useMemo, useState, type ReactNode } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { useRouter } from '@tanstack/react-router';
import type { WorkspaceId } from '@common/ids';
import type { WorkspaceInfo } from '@common/types';
import {
  describeWorkspaceFailure,
  WorkspaceErrorDialog,
  type WorkspaceFailure,
} from './WorkspaceErrors';

// What the window does to the workspace registry: open one, add a folder, create one. Each open
// goes through main, whose `workspace.changed` the session follows (the splash, then the new
// workspace's page): nothing here navigates. A failure shows its dialog, over whatever the window
// shows, from the one provider in the root's shell.

export interface WorkspaceActions {
  // the registry, as workspaces.list has it
  workspaces: WorkspaceInfo[];
  open: (workspace: Pick<WorkspaceInfo, 'id' | 'name'>) => void;
  // "Open Existing Folder…": asks main for a folder, adds it, then opens it
  openFolder: () => void;
  // creates the workspace, then opens it; rejects with what create threw (shown in the form)
  create: (input: { name: string; color: string }) => Promise<void>;
  // an add or a create is running
  busy: boolean;
}

const Context = createContext<WorkspaceActions | null>(null);

export function useWorkspaceActions(): WorkspaceActions {
  const actions = useContext(Context);
  if (!actions) throw new Error('useWorkspaceActions needs a WorkspaceActionsProvider');
  return actions;
}

export function WorkspaceActionsProvider({ children }: { children: ReactNode }) {
  const { trpc, devBrainAvailable } = useRouter().options.context;
  const [failure, setFailure] = useState<WorkspaceFailure | null>(null);
  const list = useQuery({ ...trpc.workspaces.list.queryOptions(), enabled: devBrainAvailable });
  const { mutate: openWorkspace } = useMutation(trpc.workspaces.open.mutationOptions());
  const { mutate: importFolder, isPending: importing } = useMutation(
    trpc.workspaces.importFolder.mutationOptions(),
  );
  const { mutateAsync: createWorkspace, isPending: creating } = useMutation(
    trpc.workspaces.create.mutationOptions(),
  );

  const actions = useMemo((): WorkspaceActions => {
    const open: WorkspaceActions['open'] = (workspace) =>
      openWorkspace({ id: workspace.id }, { onError: (error) => setFailure({ error, workspace }) });
    return {
      workspaces: list.data?.items ?? [],
      open,
      openFolder: () =>
        importFolder(undefined, {
          onSuccess: (added) => added && open(added),
          onError: (error) => setFailure({ error }),
        }),
      create: async (input) => open(await createWorkspace(input)),
      busy: importing || creating,
    };
  }, [list.data, openWorkspace, importFolder, importing, createWorkspace, creating]);

  return (
    <Context.Provider value={actions}>
      {children}
      {failure && (
        <WorkspaceErrorDialog
          described={describeWorkspaceFailure(failure, {
            workspaces: actions.workspaces,
            openFolder: actions.openFolder,
            open: (id: WorkspaceId) => {
              const workspace = actions.workspaces.find((w) => w.id === id);
              if (workspace) actions.open(workspace);
            },
          })}
          onClose={() => setFailure(null)}
        />
      )}
    </Context.Provider>
  );
}
