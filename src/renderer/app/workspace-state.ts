import { useSyncExternalStore } from 'react';
import type { AppEvents } from '@common/events';
import type { WorkspaceId } from '@common/ids';
import type { WorkspaceSnapshot, WorkspaceState } from '@common/types';
import type { EventClient } from '../ipc/events';

// How long the splash shows at least, so a quick open doesn't flicker.
export const SPLASH_MINIMUM_MS = 600;

/**
 * The workspace state the window shows: main's newest snapshot, by version, of the initial load
 * context's, `workspace.changed`'s and `workspaces.state`'s, held back while the splash has been
 * up for less than `SPLASH_MINIMUM_MS`.
 *
 * `keepPage` says, for an `open` state, whether the window's location already belongs to that
 * workspace and so stays: true on a reload into the workspace that was open, and when a switch
 * away failed and the same workspace is back. Otherwise the workspace opens on its landing page.
 */
export interface ShownWorkspaceState {
  version: number;
  state: WorkspaceState;
  keepPage: boolean;
}

export interface WorkspaceStateStore {
  /** what to show now */
  get(): ShownWorkspaceState;
  /** calls `listener` whenever `get()` changes; returns the function that stops */
  subscribe(listener: () => void): () => void;
  /** stops following main */
  stop(): void;
}

export interface WorkspaceStateStoreOptions {
  /** the initial load context's snapshot; no workspace (version 0) without one */
  initial: WorkspaceSnapshot | null;
  /** main's push events, for `workspace.changed` */
  events: EventClient<AppEvents>;
  /** asks main for its snapshot now (`workspaces.state`); left out when DevBrain is unavailable */
  fetch?: () => Promise<WorkspaceSnapshot>;
  holdMs?: number;
  now?: () => number;
  setTimer?: (run: () => void, ms: number) => unknown;
  clearTimer?: (timer: unknown) => void;
}

/**
 * Starts from `initial`, listens to `workspace.changed`, then asks `fetch` once: an event main sent
 * between building the initial load context and this listening would otherwise be lost (an `open`
 * missed there would leave the window on the splash). Keeping the newest by version makes the order
 * of the three irrelevant. Create it before the first render. `get()` returns the same object until
 * something changes, as `useSyncExternalStore` needs.
 */
export function createWorkspaceStateStore({
  initial,
  events,
  fetch,
  holdMs = SPLASH_MINIMUM_MS,
  now = Date.now,
  setTimer = (run, ms) => setTimeout(run, ms),
  clearTimer = (timer) => clearTimeout(timer as ReturnType<typeof setTimeout>),
}: WorkspaceStateStoreOptions): WorkspaceStateStore {
  const listeners = new Set<() => void>();
  let shown!: ShownWorkspaceState;
  // the newest version seen, shown or pending
  let newest = 0;
  // when the splash went up, while it is up
  let openingSince: number | null = null;
  // the workspace whose page the window's location shows: kept through the splash, forgotten at
  // onboarding
  let pageOf: WorkspaceId | null = null;
  let pending: WorkspaceSnapshot | null = null;
  let timer: unknown = null;

  const show = (snapshot: WorkspaceSnapshot, initial: boolean) => {
    const { state } = snapshot;
    let keepPage = false;
    if (state.status === 'open') {
      // a page load into an open workspace is a reload: the location is that workspace's
      keepPage = initial || pageOf === state.workspace.id;
      pageOf = state.workspace.id;
    } else if (state.status === 'none') {
      pageOf = null;
    }
    if (state.status === 'opening') openingSince ??= now();
    else openingSince = null;
    shown = { version: snapshot.version, state, keepPage };
  };

  const cancelPending = () => {
    if (timer !== null) clearTimer(timer);
    timer = null;
    pending = null;
  };

  const receive = (snapshot: WorkspaceSnapshot) => {
    if (snapshot.version <= newest) return;
    newest = snapshot.version;
    cancelPending();
    const held =
      openingSince === null || snapshot.state.status === 'opening'
        ? 0
        : openingSince + holdMs - now();
    if (held > 0) {
      pending = snapshot;
      timer = setTimer(() => {
        const next = pending;
        timer = null;
        pending = null;
        if (next === null) return;
        show(next, false);
        listeners.forEach((listener) => listener());
      }, held);
      return;
    }
    show(snapshot, false);
    listeners.forEach((listener) => listener());
  };

  const first = initial ?? NO_WORKSPACE;
  newest = first.version;
  show(first, true);
  // listen first, then catch up on anything sent before this listened
  let stopped = false;
  const unsubscribe = events.on('workspace.changed', receive);
  fetch?.()
    .then((snapshot) => {
      if (!stopped) receive(snapshot);
    })
    .catch(() => {
      // the events still arrive; a failed catch-up only matters for a change already missed
    });

  return {
    get: () => shown,
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    stop() {
      stopped = true;
      unsubscribe();
      cancelPending();
    },
  };
}

const NO_WORKSPACE: WorkspaceSnapshot = { version: 0, state: { status: 'none', error: null } };

/** The workspace state to show, re-rendering on each change. */
export function useWorkspaceState(store: WorkspaceStateStore): ShownWorkspaceState {
  return useSyncExternalStore(store.subscribe, store.get);
}
