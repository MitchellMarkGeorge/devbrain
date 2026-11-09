import { useState, useSyncExternalStore } from 'react';
import { useNavigate, useParams } from '@tanstack/react-router';
import { useMutation, useQuery } from '@tanstack/react-query';
import { Ellipsis, FileText, Folder } from 'lucide-react';
import type { StampedEntity } from '@common/types';
import {
  resolveColor,
  SidebarGroup,
  SidebarItem,
  StatusIcon,
  SyncStatus,
  useFormat,
} from '../../components';
import { trpc } from '../../ipc';
import { useOpenEntity } from './use-open-entity';
import { summarizeSync } from './sync-state';

// The sidebar's Recents, Favorites and sync line (docs/renderer/implementation-plan.md, "App
// layout"), from core's lists; each item opens with useOpenEntity.

const SHOWN = 5;
const MORE = 50;

/** One recent or favorite: its entity's glyph (a task's status, a project's folder in its colour, a note's page, an event's bar) and title. */
function EntityItem({ item }: { item: StampedEntity<'viewedAt'> | StampedEntity<'favoritedAt'> }) {
  const openEntity = useOpenEntity();
  const open = () =>
    openEntity({
      id: item.entity.id,
      startAt: item.entityType === 'events' ? item.entity.startAt : undefined,
    });
  switch (item.entityType) {
    case 'tasks':
      return (
        <SidebarItem icon={<StatusIcon status={item.entity.status} />} onClick={open}>
          {item.entity.title}
        </SidebarItem>
      );
    case 'projects':
      return (
        <SidebarItem icon={Folder} iconColor={resolveColor(item.entity.color)} onClick={open}>
          {item.entity.title}
        </SidebarItem>
      );
    case 'notes':
      return (
        <SidebarItem icon={FileText} onClick={open}>
          {item.entity.title || 'Untitled'}
        </SidebarItem>
      );
    case 'events':
      return (
        <SidebarItem bar={resolveColor(item.entity.color, 'blue')} onClick={open}>
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
  if (items.length === 0) return null;
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
 * The sync line at the top of the footer, for every source that syncs; nothing while none is
 * connected. Kept fresh by the invalidator (`sources.changed`, `sync.progress`). Its line opens
 * Integrations; Retry runs `sync.now`.
 */
export function SidebarSync() {
  const { workspaceId } = useParams({ from: '/app/$workspaceId' });
  const navigate = useNavigate();
  const format = useFormat('minute');
  const online = useSyncExternalStore(subscribeOnline, () => navigator.onLine);
  const status = useQuery(trpc.sync.status.queryOptions());
  const syncNow = useMutation(trpc.sync.now.mutationOptions());
  const summary = summarizeSync(status.data ?? [], online, format.now);
  if (!summary) return null;
  return (
    <SyncStatus
      state={summary.state}
      lastSynced={
        summary.lastSyncedAt ? format.formatRelative(summary.lastSyncedAt).toLowerCase() : undefined
      }
      retryAt={summary.retryAt ? format.formatTime(summary.retryAt) : undefined}
      onOpen={() =>
        void navigate({ to: '/app/$workspaceId/integrations', params: { workspaceId } })
      }
      onRetry={() => syncNow.mutate(undefined)}
    />
  );
}
