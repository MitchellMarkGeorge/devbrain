import { useSyncExternalStore } from 'react';
import type { IpcBridge } from '@common/ipc/types';
import type { WorkspaceId } from '@common/ids';
import type { WorkspaceSnapshot, WorkspaceState } from '@common/types';

// How long the splash shows at least, so a quick open doesn't flicker.
export const SPLASH_MINIMUM_MS = 600;

/**
 * The workspace state the window shows: main's newest snapshot (from the preload's
 * `workspaceState`), held back while the splash has been up for less than `SPLASH_MINIMUM_MS`.
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
  /** what to show now, or null while main has said nothing (no initial load context) */
  get(): ShownWorkspaceState | null;
  /** calls `listener` whenever `get()` changes; returns the function that stops */
  subscribe(listener: () => void): () => void;
  /** stops following the bridge */
  stop(): void;
}

export interface WorkspaceStateStoreOptions {
  source: IpcBridge['workspaceState'];
  holdMs?: number;
  now?: () => number;
  setTimer?: (run: () => void, ms: number) => unknown;
  clearTimer?: (timer: unknown) => void;
}

/**
 * Follows `source`. Reads it once, then subscribes, in the same tick, so no snapshot is missed.
 * The bridge clones a value at each call, so the store keeps its own copy: `get()` returns the
 * same object until something changes, as `useSyncExternalStore` needs.
 */
export function createWorkspaceStateStore({
  source,
  holdMs = SPLASH_MINIMUM_MS,
  now = Date.now,
  setTimer = (run, ms) => setTimeout(run, ms),
  clearTimer = (timer) => clearTimeout(timer as ReturnType<typeof setTimeout>),
}: WorkspaceStateStoreOptions): WorkspaceStateStore {
  const listeners = new Set<() => void>();
  let shown: ShownWorkspaceState | null = null;
  // the newest version seen, shown or pending
  let newest = -1;
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

  const first = source.get();
  if (first !== null) {
    newest = first.version;
    show(first, true);
  }
  const unsubscribe = source.subscribe(receive);

  return {
    get: () => shown,
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    stop() {
      unsubscribe();
      cancelPending();
    },
  };
}

/** The workspace state to show, re-rendering on each change. */
export function useWorkspaceState(store: WorkspaceStateStore): ShownWorkspaceState | null {
  return useSyncExternalStore(store.subscribe, store.get);
}
