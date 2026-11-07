import { useNavigate, useParams } from '@tanstack/react-router';
import { useMutation, useQuery } from '@tanstack/react-query';
import { SidebarWorkspace, WorkspaceSwitcher } from '../../components';
import type { WorkspaceId } from '@common/ids';
import { trpc } from '../../ipc';
import { swatchOf } from '../../workspace/colors';
import { useOpenFolder } from '../workspaces/use-open-folder';

/**
 * The sidebar's workspace menu. Switching is navigating to the workspace's link, `/app/<id>`,
 * which opens it under the splash and lands on its last or landing page; "New workspace…" opens
 * the Create workspace dialog, "Open folder…" adds a folder and goes to it.
 */
export function WorkspaceMenu({ onNewWorkspace }: { onNewWorkspace: () => void }) {
  const { workspaceId } = useParams({ from: '/app/$workspaceId' });
  const navigate = useNavigate();
  const list = useQuery(trpc.workspaces.list.queryOptions());
  const showInFolder = useMutation(trpc.workspace.showInFolder.mutationOptions());
  const openFolder = useOpenFolder();
  const workspaces = list.data?.items ?? [];
  const current = workspaces.find((workspace) => workspace.id === workspaceId);
  return (
    <>
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
          onCreate={onNewWorkspace}
          onOpenFolder={openFolder.run}
          onShowInFinder={() => showInFolder.mutate()}
        />
      </SidebarWorkspace>
      {openFolder.dialog}
    </>
  );
}
