import { useEffect, useRef, useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import type { WorkspaceEntry } from '@main/core';
import { ipc, trpc } from './ipc';
import type { BootSnapshot } from './ipc/boot';
import { chooseScreen, opensLastOnLoad, type OpenRequest } from './startup';
import { CreateWorkspace } from './screens/CreateWorkspace';
import { DevBrainUnavailable } from './screens/DevBrainUnavailable';
import { SplashScreen } from './screens/SplashScreen';
import { WorkspaceHome } from './screens/WorkspaceHome';
import { WorkspacePicker } from './screens/WorkspacePicker';

// Runs one OpenRequest. Each call's `changed` refetches the workspace queries before it settles
// (src/renderer/ipc/link.ts), so `current` is the new workspace once this resolves.
async function runOpenRequest(request: OpenRequest): Promise<WorkspaceEntry | null> {
  switch (request.kind) {
    case 'last':
      return ipc.workspaces.openLast.mutate();
    case 'open':
      return ipc.workspaces.open.mutate({ id: request.workspace.id });
    case 'create': {
      const created = await ipc.workspaces.create.mutate({
        name: request.name,
        color: request.color,
      });
      return ipc.workspaces.open.mutate({ id: created.id });
    }
  }
}

// The app's screens: the splash while a workspace opens, then the open workspace, or the picker
// or create page when none is. Startup reopens the last workspace from here, once.
export function App({ boot }: { boot: BootSnapshot | null }) {
  // seeded from the boot snapshot (src/renderer/main.tsx), so these start with data
  const current = useQuery(trpc.workspaces.current.queryOptions());
  const list = useQuery(trpc.workspaces.list.queryOptions());
  const opening = useMutation({ mutationFn: runOpenRequest });
  const [creatingNew, setCreatingNew] = useState(false);

  // once per page load: a ref, as StrictMode runs effects twice in development. openLast is
  // idempotent anyway, returning the workspace already open
  const askedForLast = useRef(false);
  const { mutate } = opening;
  useEffect(() => {
    if (askedForLast.current || !opensLastOnLoad(boot)) return;
    askedForLast.current = true;
    mutate({ kind: 'last', workspace: boot?.last ?? null });
  }, [boot, mutate]);

  const open = (request: OpenRequest) => {
    setCreatingNew(false);
    mutate(request);
  };

  const screen = chooseScreen({
    boot,
    // the mutation leaves idle with its first request, which is openLast's when it runs
    askedForLast: !opening.isIdle,
    opening: opening.isPending ? opening.variables : null,
    openError: opening.error,
    current: current.data,
    currentError: current.error,
    workspaces: list.data?.items,
    creatingNew,
  });

  switch (screen.screen) {
    case 'unavailable':
      return <DevBrainUnavailable />;
    case 'splash':
      return <SplashScreen workspace={screen.workspace} />;
    case 'workspace':
      return (
        <WorkspaceHome
          workspace={screen.workspace}
          workspaces={list.data?.items ?? []}
          onSwitch={(workspace) => open({ kind: 'open', workspace })}
        />
      );
    case 'picker':
      return (
        <WorkspacePicker
          workspaces={screen.workspaces}
          error={screen.error}
          onOpen={(workspace) => open({ kind: 'open', workspace })}
          onNew={() => setCreatingNew(true)}
        />
      );
    case 'create':
      return (
        <CreateWorkspace
          error={screen.error}
          onCancel={screen.canCancel ? () => setCreatingNew(false) : null}
          onCreate={(input) => open({ kind: 'create', ...input })}
        />
      );
  }
}
