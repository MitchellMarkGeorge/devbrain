import { forwardRef, type ComponentPropsWithoutRef, type ReactNode } from 'react';
import { CircleAlert, CircleCheck, Clock, LoaderCircle, RotateCw, WifiOff } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { cn } from '../../lib/cn';
import { Icon } from '../../ui/Icon';
import { IconButton } from '../../ui/IconButton';
import { Tooltip } from '../../ui/Tooltip';
import styles from './SyncStatus.module.css';

/** What `sync.status` reports: the last run, one in flight, a failure, a provider's back-off, or no network. */
export type SyncState = 'synced' | 'syncing' | 'error' | 'rate-limited' | 'offline';

const ICONS: Record<SyncState, LucideIcon> = {
  synced: CircleCheck,
  syncing: LoaderCircle,
  error: CircleAlert,
  'rate-limited': Clock,
  offline: WifiOff,
};

export interface SyncStatusProps extends Omit<ComponentPropsWithoutRef<'div'>, 'children'> {
  state: SyncState;
  /**
   * The line's text; each state has its own default, short enough for the footer's row: "Synced 2
   * min ago" (pass `lastSynced`), "Syncing…", "Sync failed", "Paused · 9:15 AM" (pass `retryAt`),
   * "Offline". Paused and offline say the rest in a tooltip.
   */
  children?: ReactNode;
  /** when the last run finished: "2 min ago" */
  lastSynced?: string;
  /** when a rate-limited provider can be asked again: "9:15 AM" */
  retryAt?: string;
  /** opens Integrations */
  onOpen?: () => void;
  /** `error` shows a Retry icon button after the line (`sync.now`) */
  onRetry?: () => void;
}

function defaultText(state: SyncState, lastSynced?: string, retryAt?: string): string {
  switch (state) {
    case 'synced':
      return lastSynced ? `Synced ${lastSynced}` : 'Synced';
    case 'syncing':
      return 'Syncing…';
    case 'error':
      return 'Sync failed';
    case 'rate-limited':
      return retryAt ? `Paused · ${retryAt}` : 'Paused';
    case 'offline':
      return 'Offline';
  }
}

/** What the short line leaves out, in its tooltip. */
function detail(state: SyncState, retryAt?: string): string | undefined {
  switch (state) {
    case 'rate-limited':
      return retryAt ? `Syncing resumes at ${retryAt}` : 'Syncing resumes shortly';
    case 'offline':
      return 'Syncing resumes when you reconnect';
    default:
      return undefined;
  }
}

/**
 * The sync line in the sidebar's footer row, before Trash, Settings and Help: a 16px state icon and
 * a 12px line that shortens rather than wraps. A failure adds a Retry icon after it. Clicking the
 * line opens Integrations.
 */
export const SyncStatus = forwardRef<HTMLDivElement, SyncStatusProps>(function SyncStatus(
  { state, children, lastSynced, retryAt, onOpen, onRetry, className, ...props },
  ref,
) {
  const text = children ?? defaultText(state, lastSynced, retryAt);
  const more = children ? undefined : detail(state, retryAt);
  const line = (
    <button type="button" className={styles.main} onClick={onOpen}>
      <Icon icon={ICONS[state]} size={16} className={styles.icon} />
      <span className={styles.text}>{text}</span>
    </button>
  );
  return (
    <div
      ref={ref}
      role="status"
      data-state={state}
      className={cn(styles.status, className)}
      {...props}
    >
      {more ? (
        <Tooltip content={more} side="top">
          {line}
        </Tooltip>
      ) : (
        line
      )}
      {state === 'error' && onRetry && (
        <IconButton
          size="xs"
          tone="muted"
          icon={RotateCw}
          label="Retry sync"
          tooltipSide="top"
          className={styles.retry}
          onClick={onRetry}
        />
      )}
    </div>
  );
});
