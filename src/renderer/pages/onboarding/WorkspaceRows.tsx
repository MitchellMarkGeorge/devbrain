import { DateTime } from 'luxon';
import type { WorkspaceInfo } from '@common/types';
import { WorkspaceList, WorkspaceListItem } from '../../components';
import { swatchOf } from '../workspaces/colors';
import { useWorkspaceActions } from '../workspaces/workspace-actions';

/** Most recently opened first; never-opened ones last, newest first. */
export function byLastOpened(workspaces: WorkspaceInfo[]): WorkspaceInfo[] {
  return [...workspaces].sort(
    (a, b) => (b.lastOpenedAt ?? 0) - (a.lastOpenedAt ?? 0) || b.createdAt - a.createdAt,
  );
}

const lastOpened = (at: number | null) =>
  at === null ? 'Never opened' : `Last opened ${DateTime.fromMillis(at).toRelativeCalendar()}`;

/** Workspaces as onboarding lists them; picking one opens it, under the splash. */
export function WorkspaceRows({
  label,
  workspaces,
}: {
  label: string;
  workspaces: WorkspaceInfo[];
}) {
  const { open, busy } = useWorkspaceActions();
  return (
    <WorkspaceList label={label} style={{ width: '100%' }}>
      {workspaces.map((workspace) => (
        <WorkspaceListItem
          key={workspace.id}
          name={workspace.name}
          color={swatchOf(workspace.color)}
          detail={lastOpened(workspace.lastOpenedAt)}
          meta={`Created ${DateTime.fromMillis(workspace.createdAt).toFormat('LLL yyyy')}`}
          disabled={busy}
          onClick={() => open(workspace)}
        />
      ))}
    </WorkspaceList>
  );
}
