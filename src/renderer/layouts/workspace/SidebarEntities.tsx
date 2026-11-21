import { useState, useSyncExternalStore } from 'react';
import { Link, useNavigate, useParams } from '@tanstack/react-router';
import { useMutation, useQuery } from '@tanstack/react-query';
import { Ellipsis, FileText, Folder } from 'lucide-react';
import type { StampedEntity } from '@common/types';
import {
  resolveColor,
  SidebarGroup,
  SidebarHint,
  SidebarItem,
  StatusIcon,
  SyncStatus,
  useFormat,
} from '@renderer/components';
import { trpc } from '@renderer/ipc';
import { entityPath } from '@renderer/shared/lib/entities';
import { hasConnectedIntegration, summarizeSync } from '@renderer/shared/lib/sync-state';

// The sidebar's Recents, Favorites and sync line (docs/renderer/implementation-plan.md, "App
// layout"), from core's lists; each item is a link to where its entity opens (entityPath).

const SHOWN = 5;
const MORE = 50;

/**
 * One recent or favorite: its entity's glyph (a task's status, a project's folder in its colour, a
 * note's page, an event's bar) and title, as a link to where it opens (an event in the calendar's
 * sheet on its day).
 */
function EntityItem({ item }: { item: StampedEntity<'viewedAt'> | StampedEntity<'favoritedAt'> }) {
  const { workspaceId } = useParams({ from: '/app/$workspaceId' });
  const href = entityPath(workspaceId, {
    id: item.entity.id,
    startAt: item.entityType === 'events' ? item.entity.startAt : undefined,
  });
  // the router builds the location from `href` alone (its path and search), as navigate({ href })
  // does; its types still ask for a `to`. Every stamped entity has a path: an id of none would
  // stay an item that goes nowhere.
  const render = href ? <Link to="." href={href} /> : undefined;
  switch (item.entityType) {
    case 'tasks':
      return (
        <SidebarItem icon={<StatusIcon status={item.entity.status} />} render={render}>
          {item.entity.title}
        </SidebarItem>
      );
    case 'projects':
      return (
        <SidebarItem icon={Folder} iconColor={resolveColor(item.entity.color)} render={render}>
          {item.entity.title}
        </SidebarItem>
      );
    case 'notes':
      return (
        <SidebarItem icon={FileText} render={render}>
          {item.entity.title || 'Untitled'}
        </SidebarItem>
      );
    case 'events':
      return (
        <SidebarItem bar={resolveColor(item.entity.color, 'blue')} render={render}>
          {item.entity.title}
        </SidebarItem>
      );
  }
}

/** The five entities viewed last; none in a new workspace, which shows no group. */
export function SidebarRecents() {
  const recents = useQuery(trpc.recents.list.queryOptions({ limit: SHOWN }));
  const items = recents.data?.items ?? [];
  if (items.length === 0) return null;
  return (
    <SidebarGroup label="Recents">
      {items.map((item) => (
        <EntityItem key={item.entity.id} item={item} />
      ))}
    </SidebarGroup>
  );
}

/** The five favorited last, and "More" for the rest. */
export function SidebarFavorites() {
  const [all, setAll] = useState(false);
  const favorites = useQuery(trpc.favorites.list.queryOptions({ limit: all ? MORE : SHOWN }));
  const items = favorites.data?.items ?? [];
  if (!favorites.data) return null;
  if (items.length === 0) {
    // nothing starred yet: the group says how to fill it
    return (
      <SidebarGroup label="Favorites">
        <SidebarHint>Star a task, note or project to keep it here.</SidebarHint>
      </SidebarGroup>
    );
  }
  return (
    <SidebarGroup label="Favorites">
      {items.map((item) => (
        <EntityItem key={item.entity.id} item={item} />
      ))}
      {!all && favorites.data?.nextCursor && (
        <SidebarItem icon={Ellipsis} onClick={() => setAll(true)}>
          More
        </SidebarItem>
      )}
    </SidebarGroup>
  );
}

function subscribeOnline(listener: () => void) {
  window.addEventListener('online', listener);
  window.addEventListener('offline', listener);
  return () => {
    window.removeEventListener('online', listener);
    window.removeEventListener('offline', listener);
  };
}

/**
 * The sync line at the start of the footer's row, for every source that syncs. While none does it
 * says "Sync off" if an integration is connected (its sources turned off) and invites to "Set up
 * sync" if none is; it shows nothing until `sync.status` first answers. Kept fresh by the
 * invalidator (`sources.changed`, `sync.progress`). Its line opens Integrations; Retry runs
 * `sync.now`.
 */
export function SidebarSync() {
  const { workspaceId } = useParams({ from: '/app/$workspaceId' });
  const navigate = useNavigate();
  const format = useFormat('minute');
  const online = useSyncExternalStore(subscribeOnline, () => navigator.onLine);
  const status = useQuery(trpc.sync.status.queryOptions());
  const syncNow = useMutation(trpc.sync.now.mutationOptions());
  const openIntegrations = () =>
    navigate({ to: '/app/$workspaceId/settings/integrations', params: { workspaceId } });
  // nothing until the first answer, so a workspace that syncs never flashes "Set up sync"
  if (!status.data) return null;
  const summary = summarizeSync(status.data, online, format.now);
  if (!summary) {
    const state = hasConnectedIntegration(status.data) ? 'off' : 'none';
    return <SyncStatus state={state} onOpen={openIntegrations} />;
  }
  return (
    <SyncStatus
      state={summary.state}
      lastSynced={
        summary.lastSyncedAt ? format.formatRelative(summary.lastSyncedAt).toLowerCase() : undefined
      }
      retryAt={summary.retryAt ? format.formatTime(summary.retryAt) : undefined}
      onOpen={openIntegrations}
      onRetry={() => syncNow.mutate(undefined)}
    />
  );
}
