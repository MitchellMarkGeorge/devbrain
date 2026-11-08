import { useNavigate, useParams } from '@tanstack/react-router';
import { useMutation, useQuery } from '@tanstack/react-query';
import { SidebarWorkspace, WorkspaceSwitcher } from '../../components';
import type { WorkspaceId } from '@common/ids';
import { trpc } from '../../ipc';
import { swatchOf } from '../../workspace/colors';
import { useOpenFolder } from '../workspaces/use-open-folder';

/**
 * The sidebar's workspace menu. Switching is navigating to the workspace's link, `/app/<id>`,
 * which opens it under the splash and lands on its last or landing page; "New workspace…" goes to
 * Create workspace, a page of its own, over this workspace (it stays open until the new one is
 * created); "Open folder…" adds a folder and goes to it.
 */
export function WorkspaceMenu() {
  const { workspaceId } = useParams({ from: '/app/$workspaceId' });
  const navigate = useNavigate();
  const list = useQuery(trpc.workspaces.list.queryOptions());
  const showInFolder = useMutation(trpc.workspace.showInFolder.mutationOptions());
  const openFolder = useOpenFolder();
  const workspaces = list.data?.items ?? [];
  const current = workspaces.find((workspace) => workspace.id === workspaceId);
  return (
    <SidebarWorkspace name={current?.name ?? 'Workspace'} color={swatchOf(current?.color)}>
      <WorkspaceSwitcher
        workspaces={workspaces.map(({ id, name, color }) => ({
          id,
          name,
          color: swatchOf(color),
        }))}
        current={workspaceId}
        onSelect={(id) =>
          void navigate({ to: '/app/$workspaceId', params: { workspaceId: id as WorkspaceId } })
        }
        onCreate={() =>
          void navigate({ to: '/workspaces/new', state: { openWorkspaceId: workspaceId } })
        }
        onOpenFolder={openFolder.run}
        onShowInFinder={() => showInFolder.mutate()}
      />
    </SidebarWorkspace>
  );
}
