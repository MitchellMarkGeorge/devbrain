/**
 * A proposal: the sidebar's footer as one row, the sync line (the real `SyncStatus`) filling it and
 * then xs icon buttons (Trash, Settings, Help), instead of a sync line and three item rows.
 * Nothing in the app uses it.
 */
import { CircleHelp, RotateCw, Settings, Trash2 } from 'lucide-react';
import { IconButton } from '../../ui/IconButton';
import { SyncStatus, type SyncState } from '../../shell/SyncStatus';
import styles from './SidebarFooterBar.module.css';

export interface SidebarFooterBarProps {
  /** the sync line; leave it out while no source syncs (the buttons then sit at the end alone) */
  sync?: SyncState;
  /** Trash as an icon here (default), or left out because it stays a row above */
  trash?: boolean;
  /** the current page, drawn pressed */
  active?: 'Trash' | 'Settings';
}

// the row has ~150px for the line: long texts get a short form, their detail in the tooltip
const SHORT: Partial<Record<SyncState, string>> = {
  offline: 'Offline',
  'rate-limited': 'Paused · 9:15 AM',
};
const DETAIL: Partial<Record<SyncState, string>> = {
  offline: 'Syncing resumes when you reconnect',
  'rate-limited': 'Linear asked us to wait; syncing resumes at 9:15 AM',
};

export function SidebarFooterBar({ sync, trash = true, active }: SidebarFooterBarProps) {
  return (
    <div className={styles.bar}>
      {sync === 'error' ? (
        <div className={styles.failed}>
          <SyncStatus state="error" onOpen={() => {}} className={styles.sync} />
          <IconButton size="xs" tone="muted" icon={RotateCw} label="Retry sync" />
        </div>
      ) : sync ? (
        <SyncStatus
          state={sync}
          lastSynced="2 min ago"
          onOpen={() => {}}
          className={styles.sync}
          title={DETAIL[sync]}
        >
          {SHORT[sync]}
        </SyncStatus>
      ) : (
        <span className={styles.sync} />
      )}
      <div className={styles.actions}>
        {trash && (
          <IconButton
            size="xs"
            tone="muted"
            icon={Trash2}
            label="Trash"
            aria-pressed={active === 'Trash'}
          />
        )}
        <IconButton
          size="xs"
          tone="muted"
          icon={Settings}
          label="Settings"
          aria-pressed={active === 'Settings'}
        />
        <IconButton size="xs" tone="muted" icon={CircleHelp} label="Help" />
      </div>
    </div>
  );
}
