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
  /** the splash's minimum; tests pass their own, with a clock and timers they move */
  holdMs?: number;
  now?: () => number;
  setTimer?: (run: () => void, ms: number) => unknown;
  clearTimer?: (timer: unknown) => void;
}

/**
 * The renderer's one source for what the window shows: the splash, onboarding or the app
 * (WindowContent draws from it). It is plain JS rather than React state because it has to start
 * listening before the first render, so no change from main is missed, and because the splash's
 * minimum and `keepPage` depend on what came before.
 *
 * It does three things:
 *
 * 1. **Takes main's newest snapshot.** Snapshots come from three places, in no fixed order: the
 *    initial load context (read as the page loads), `workspace.changed`, and one `workspaces.state`
 *    call made right after it starts listening. That call catches a change sent between main
 *    building the initial load context and this listening, which would otherwise be lost (an
 *    `open` missed there would leave the window on the splash). Main numbers every snapshot, so
 *    the store keeps the highest version and drops anything older or repeated.
 * 2. **Holds the splash for at least `holdMs`.** While the splash is up, a snapshot that would
 *    end it waits until `holdMs` after the splash appeared, so a quick open doesn't flicker. A
 *    newer snapshot replaces one that waits; another `opening` shows at once.
 * 3. **Works out `keepPage`** for each `open` it shows (see `ShownWorkspaceState`).
 *
 * Create it once, before the first render (main.tsx). `get()` returns the same object until
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

  // What the window shows now: what get() returns.
  let shown!: ShownWorkspaceState;
  // The highest version received, shown or waiting. Anything at or below it is old news.
  let newestVersion = 0;
  // When the splash went up; null while it isn't up.
  let splashSince: number | null = null;
  // The workspace whose page the window's location (the hash) shows. The splash leaves the hash
  // alone, so this survives it; onboarding forgets it, as the next open is a fresh start.
  let pageBelongsTo: WorkspaceId | null = null;
  // A snapshot received while the splash is held, and the timer that will show it.
  let waiting: { snapshot: WorkspaceSnapshot; timer: unknown } | null = null;

  // Makes `snapshot` what the window shows. `isPageLoad` is true for the first one only.
  const show = (snapshot: WorkspaceSnapshot, isPageLoad: boolean) => {
    const { state } = snapshot;
    let keepPage = false;
    switch (state.status) {
      case 'open':
        // the page loading into an open workspace is a reload, so the hash is that workspace's;
        // after a failed switch, the same workspace is back and so is its page
        keepPage = isPageLoad || pageBelongsTo === state.workspace.id;
        pageBelongsTo = state.workspace.id;
        splashSince = null;
        break;
      case 'opening':
        // a second opening while the splash is up keeps its original start
        splashSince ??= now();
        break;
      case 'none':
        pageBelongsTo = null;
        splashSince = null;
        break;
    }
    shown = { version: snapshot.version, state, keepPage };
  };

  const notify = () => listeners.forEach((listener) => listener());

  const cancelWaiting = () => {
    if (waiting !== null) clearTimer(waiting.timer);
    waiting = null;
  };

  // Every snapshot after the first comes through here, from the event or the catch-up call.
  const receive = (snapshot: WorkspaceSnapshot) => {
    if (snapshot.version <= newestVersion) return;
    newestVersion = snapshot.version;
    // whatever was waiting is older than this
    cancelWaiting();

    // how much longer the splash must stay up before this can replace it
    const holdLeft =
      splashSince === null || snapshot.state.status === 'opening'
        ? 0
        : splashSince + holdMs - now();
    if (holdLeft <= 0) {
      show(snapshot, false);
      notify();
      return;
    }
    const timer = setTimer(() => {
      waiting = null;
      show(snapshot, false);
      notify();
    }, holdLeft);
    waiting = { snapshot, timer };
  };

  // 1. what main said as the page loaded
  const first = initial ?? NO_WORKSPACE;
  newestVersion = first.version;
  show(first, true);

  // 2. listen, then 3. catch up on anything main sent before this listened. In this order, a
  // change is either in the call's answer or arrives as an event (or both, deduplicated by version).
  let stopped = false;
  const unsubscribe = events.on('workspace.changed', receive);
  fetch?.()
    .then((snapshot) => {
      if (!stopped) receive(snapshot);
    })
    .catch(() => {
      // later changes still arrive as events; only one already missed is lost
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
      cancelWaiting();
    },
  };
}

const NO_WORKSPACE: WorkspaceSnapshot = { version: 0, state: { status: 'none', error: null } };

/** The workspace state to show, re-rendering on each change. */
export function useWorkspaceState(store: WorkspaceStateStore): ShownWorkspaceState {
  return useSyncExternalStore(store.subscribe, store.get);
}
