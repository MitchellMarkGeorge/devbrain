import { DateTime } from 'luxon';
import { useNavigate } from '@tanstack/react-router';
import type { WorkspaceInfo } from '@common/types';
import { WorkspaceListItem } from '../../components';
import { swatchOf } from '../../workspace/colors';

/** Most recently opened first; never-opened ones after, newest first. */
export function byRecentlyOpened(workspaces: WorkspaceInfo[]): WorkspaceInfo[] {
  return [...workspaces].sort(
    (a, b) => (b.lastOpenedAt ?? 0) - (a.lastOpenedAt ?? 0) || b.createdAt - a.createdAt,
  );
}

/** "Last opened 2 days ago", or "Never opened". */
export function lastOpened(workspace: WorkspaceInfo): string {
  if (workspace.lastOpenedAt === null) return 'Never opened';
  return `Last opened ${DateTime.fromMillis(workspace.lastOpenedAt).toRelative() ?? ''}`.trim();
}

/** A workspace on onboarding's lists: picking it goes to it, which opens it. */
export function WorkspaceRow({ workspace }: { workspace: WorkspaceInfo }) {
  const navigate = useNavigate();
  return (
    <WorkspaceListItem
      name={workspace.name}
      color={swatchOf(workspace.color)}
      detail={lastOpened(workspace)}
      meta={`Created ${DateTime.fromMillis(workspace.createdAt).toFormat('LLL yyyy')}`}
      onClick={() =>
        void navigate({ to: '/app/$workspaceId', params: { workspaceId: workspace.id } })
      }
    />
  );
}
