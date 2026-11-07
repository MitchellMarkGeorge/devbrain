import { useSyncExternalStore } from 'react';
import type { AppEvents } from '@common/events';
import type { InitialLoadContext } from '@common/ipc/types';
import type { WorkspaceStatus } from '@common/types';
import type { IpcServices } from '../ipc';
import type { EventClient } from '../ipc/events';
import { useServices } from './context';

/**
 * Which workspace is open and which is opening, as main last said: from the initial load context,
 * then `workspace.changed`. The guards read it in `beforeLoad`, and `/` and the root follow it.
 */
export interface WorkspaceStatusStore {
  get(): WorkspaceStatus;
  /** calls `listener` on each change; returns the function that stops */
  subscribe(listener: () => void): () => void;
  /** asks main again (`workspaces.status`), for a change the page may have missed */
  refresh(): Promise<void>;
}

const NONE: WorkspaceStatus = { id: null, opening: null };

/** The status the page starts with: what main held when it loaded. */
export function initialWorkspaceStatus(context: InitialLoadContext | null): WorkspaceStatus {
  return { id: context?.current?.id ?? null, opening: context?.opening?.id ?? null };
}

/**
 * Follows `workspace.changed` from now on. An event sent between main building the initial load
 * context and this subscribing is lost, so call `refresh()` once after creating it.
 */
export function createWorkspaceStatus({
  events,
  ipc,
  initial = NONE,
}: {
  events: EventClient<AppEvents>;
  ipc: IpcServices['ipc'];
  initial?: WorkspaceStatus;
}): WorkspaceStatusStore {
  let status = initial;
  // counts the events, so an answer to refresh() never overwrites a newer event
  let received = 0;
  const listeners = new Set<() => void>();

  const set = (next: WorkspaceStatus) => {
    if (next.id === status.id && next.opening === status.opening) return;
    status = { id: next.id, opening: next.opening };
    listeners.forEach((listener) => listener());
  };

  events.on('workspace.changed', (next) => {
    received += 1;
    set(next);
  });

  return {
    get: () => status,
    subscribe: (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    refresh: async () => {
      const asked = received;
      const answer = await ipc.workspaces.status.query().catch(() => null);
      if (answer !== null && received === asked) set(answer);
    },
  };
}

/** The workspace status, re-rendering on each change. */
export function useWorkspaceStatus(): WorkspaceStatus {
  const { workspaceStatus } = useServices();
  return useSyncExternalStore(workspaceStatus.subscribe, workspaceStatus.get);
}

/**
 * Where the window belongs for `status`: `/` while a workspace opens (the splash), the app while
 * one is open, onboarding while none is.
 */
export type Place = 'opening' | 'app' | 'onboarding';

export function placeOf({ id, opening }: WorkspaceStatus): Place {
  if (opening !== null) return 'opening';
  return id === null ? 'onboarding' : 'app';
}

/** The place a path is in, or null for one in none (a path with no page). */
export function placeAt(pathname: string): Place | null {
  if (pathname === '/') return 'opening';
  if (pathname === '/app' || pathname.startsWith('/app/')) return 'app';
  if (pathname === '/onboarding' || pathname.startsWith('/onboarding/')) return 'onboarding';
  return null;
}
