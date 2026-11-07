import { DateTime } from 'luxon';
import type { WorkspaceId } from '@common/ids';
import type { WorkspaceInfo } from '@common/types';
import { WorkspaceList, WorkspaceListItem } from '../../components';
import { swatchOf } from '../../app/swatches';
import styles from './onboarding.module.css';

/** Most recently opened first; never opened last, newest first. */
export function byLastOpened(a: WorkspaceInfo, b: WorkspaceInfo): number {
  return (b.lastOpenedAt ?? -1) - (a.lastOpenedAt ?? -1) || b.createdAt - a.createdAt;
}

export function lastOpenedLabel(workspace: WorkspaceInfo, now: DateTime = DateTime.now()): string {
  if (workspace.lastOpenedAt === null) return 'Never opened';
  return `Last opened ${DateTime.fromMillis(workspace.lastOpenedAt).toRelative({ base: now }) ?? ''}`;
}

export function createdLabel(workspace: WorkspaceInfo): string {
  return `Created ${DateTime.fromMillis(workspace.createdAt).toFormat('LLL yyyy')}`;
}

/** Workspaces to open, as the Welcome card lists them. */
export function WorkspacePicker({
  label,
  workspaces,
  onOpen,
  disabled,
}: {
  label: string;
  workspaces: readonly WorkspaceInfo[];
  onOpen: (id: WorkspaceId) => void;
  disabled?: boolean;
}) {
  return (
    <WorkspaceList label={label} className={styles.list}>
      {workspaces.map((workspace) => (
        <WorkspaceListItem
          key={workspace.id}
          name={workspace.name}
          color={swatchOf(workspace.color)}
          detail={lastOpenedLabel(workspace)}
          meta={createdLabel(workspace)}
          disabled={disabled}
          onClick={() => onOpen(workspace.id)}
        />
      ))}
    </WorkspaceList>
  );
}
