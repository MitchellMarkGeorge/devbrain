import { forwardRef, type ComponentPropsWithoutRef, type ReactNode } from 'react';
import { CircleAlert, CircleCheck, Clock, LoaderCircle, RotateCw, WifiOff } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { cn } from '../../lib/cn';
import { Button } from '../../ui/Button';
import { Icon } from '../../ui/Icon';
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
   * The line's text; each state has its own default: "Synced 2 min ago" (pass `lastSynced`),
   * "Syncing…", "Sync failed", "Paused until 9:15 AM" (pass `retryAt`), "Offline · syncing
   * resumes when you reconnect".
   */
  children?: ReactNode;
  /** when the last run finished: "2 min ago" */
  lastSynced?: string;
  /** when a rate-limited provider can be asked again: "9:15 AM" */
  retryAt?: string;
  /** opens Integrations */
  onOpen?: () => void;
  /** `error` shows a Retry button (`sync.now`) */
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
      return retryAt ? `Paused until ${retryAt}` : 'Paused';
    case 'offline':
      return 'Offline · syncing resumes when you reconnect';
  }
}

/**
 * The sync indicator at the top of the sidebar's footer: a 16px state icon and a 12px line; a
 * failure adds "· Retry". Clicking the line opens Integrations.
 */
export const SyncStatus = forwardRef<HTMLDivElement, SyncStatusProps>(function SyncStatus(
  { state, children, lastSynced, retryAt, onOpen, onRetry, className, ...props },
  ref,
) {
  const text = children ?? defaultText(state, lastSynced, retryAt);
  return (
    <div
      ref={ref}
      role="status"
      data-state={state}
      className={cn(styles.status, className)}
      {...props}
    >
      <button type="button" className={styles.main} onClick={onOpen}>
        <Icon icon={ICONS[state]} size={16} className={styles.icon} />
        <span className={styles.text}>{text}</span>
      </button>
      {state === 'error' && onRetry && (
        <>
          <span className={styles.dot} aria-hidden>
            ·
          </span>
          <Button variant="ghost" size="xs" icon={RotateCw} onClick={onRetry}>
            Retry
          </Button>
        </>
      )}
    </div>
  );
});
