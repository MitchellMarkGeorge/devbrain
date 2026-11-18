import { IntegrationStatus, type SourceSyncStatus } from '@common/types';
import type { SyncState } from '@renderer/components';

/** What the sidebar's sync line shows, from `sync.status`. */
export interface SyncSummary {
  state: SyncState;
  /** when the last run of any source finished */
  lastSyncedAt: Date | null;
  /** when a rate-limited provider can be asked again */
  retryAt: Date | null;
}

/**
 * Whether an integration is connected: an account the user set up and hasn't turned off, including
 * one that needs reconnecting. With none, the sidebar invites to "Set up sync"; with one whose
 * sources are all off, it says "Sync off".
 */
export function hasConnectedIntegration(sources: readonly SourceSyncStatus[]): boolean {
  return sources.some(
    (source) =>
      source.status === IntegrationStatus.CONNECTED ||
      source.status === IntegrationStatus.NEEDS_REAUTH,
  );
}

/**
 * The sidebar's one sync line for every source that syncs (enabled, on a connected account or one
 * that needs reconnecting), or null when none does (the sidebar then says "Sync off" or "Set up
 * sync", from `hasConnectedIntegration`). Worst first: offline, a run in flight, a failure, a
 * provider's back-off, then synced.
 */
export function summarizeSync(
  sources: readonly SourceSyncStatus[],
  online: boolean,
  now: Date,
): SyncSummary | null {
  const syncing = sources.filter(
    (source) => source.enabled && source.status === IntegrationStatus.CONNECTED,
  );
  // an account that needs reconnecting syncs nothing until it is
  const attention = sources.filter(
    (source) => source.enabled && source.status === IntegrationStatus.NEEDS_REAUTH,
  );
  if (syncing.length === 0 && attention.length === 0) return null;
  const times = syncing.flatMap((source) => (source.lastSyncedAt ? [source.lastSyncedAt] : []));
  const lastSyncedAt =
    times.length > 0 ? new Date(Math.max(...times.map((time) => new Date(time).getTime()))) : null;
  const waits = syncing.flatMap((source) =>
    source.retryAt && new Date(source.retryAt) > now ? [new Date(source.retryAt)] : [],
  );
  const retryAt = waits.length > 0 ? new Date(Math.max(...waits.map((t) => t.getTime()))) : null;
  const summary = (state: SyncState): SyncSummary => ({ state, lastSyncedAt, retryAt });
  if (!online) return summary('offline');
  if (syncing.some((source) => source.running)) return summary('syncing');
  if (attention.length > 0 || syncing.some((source) => source.lastError && !source.retryAt)) {
    return summary('error');
  }
  if (retryAt) return summary('rate-limited');
  return summary('synced');
}
