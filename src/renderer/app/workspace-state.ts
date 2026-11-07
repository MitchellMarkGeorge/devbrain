import { useSyncExternalStore } from 'react';
import type { AppEvents } from '@common/events';
import type { WorkspaceId } from '@common/ids';
import type { WorkspaceInfo, WorkspaceSnapshot, WorkspaceState } from '@common/types';
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
  /**
   * The newest state received: the one waiting to show (held by the splash, or being prepared),
   * else the one shown. What the app's router starts for (its `/` route reads it).
   */
  latest(): ShownWorkspaceState;
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
  /**
   * Gets the window ready for a state about to show (startApp: the app's router on the new
   * workspace's page). Called as each state is received; when it returns a promise, the state waits
   * for it, with the splash still up. The first state, as the store is made, shows at once: the
   * router has never loaded then, so it has no old page to show.
   */
  prepare?: (next: ShownWorkspaceState) => Promise<void> | undefined;
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
 * It does four things:
 *
 * 1. **Takes main's newest snapshot.** Snapshots come from three places, in no fixed order: the
 *    initial load context (read as the page loads), `workspace.changed`, and one `workspaces.state`
 *    call made right after it starts listening. That call catches a change sent between main
 *    building the initial load context and this listening, which would otherwise be lost (an
 *    `open` missed there would leave the window on the splash). Main numbers every snapshot, so
 *    the store keeps the highest version and drops anything older or repeated.
 * 2. **Works out `keepPage`** for each `open` (see `ShownWorkspaceState`).
 * 3. **Prepares each state** (`prepare`) as it arrives, and waits for it: for an `open`, the app's
 *    router loads the workspace's page while the splash is still up, so the app never appears on
 *    the previous workspace's page.
 * 4. **Holds the splash for at least `holdMs`.** While the splash is up, a snapshot that would
 *    end it waits until `holdMs` after the splash appeared, so a quick open doesn't flicker.
 *
 * A state shows once both 3 and 4 are done. A newer snapshot replaces one that waits; another
 * `opening` shows at once.
 *
 * Create it once, before the first render (main.tsx). `get()` returns the same object until
 * something changes, as `useSyncExternalStore` needs.
 */
export function createWorkspaceStateStore({
  initial,
  events,
  fetch,
  prepare,
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
  // alone, so this survives it; onboarding forgets it, as the next open is a fresh start. Updated
  // as a state is received, since preparing it may move the hash.
  let pageBelongsTo: WorkspaceId | null = null;
  // A state received but not shown yet, with what it still waits for: the splash's minimum (the
  // timer) and its preparation. `left` counts the two that are still running.
  let waiting: { next: ShownWorkspaceState; timer: unknown; left: number } | null = null;

  // The state to show for `snapshot`, with its keepPage. `isPageLoad` is true for the first only.
  const describe = (snapshot: WorkspaceSnapshot, isPageLoad: boolean): ShownWorkspaceState => {
    const { state } = snapshot;
    let keepPage = false;
    if (state.status === 'open') {
      // the page loading into an open workspace is a reload, so the hash is that workspace's;
      // after a failed switch, the same workspace is back and so is its page
      keepPage = isPageLoad || pageBelongsTo === state.workspace.id;
      pageBelongsTo = state.workspace.id;
    } else if (state.status === 'none') {
      pageBelongsTo = null;
    }
    return { version: snapshot.version, state, keepPage };
  };

  // Makes `next` what the window shows, and tells the listeners (React).
  const show = (next: ShownWorkspaceState) => {
    // a second opening while the splash is up keeps its original start
    if (next.state.status === 'opening') splashSince ??= now();
    else splashSince = null;
    shown = next;
    listeners.forEach((listener) => listener());
  };

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

    const next = describe(snapshot, false);
    const entry = { next, timer: null as unknown, left: 0 };
    // one of the two things it waits for is done; shows it once both are, unless replaced
    const done = () => {
      if (waiting !== entry || --entry.left > 0) return;
      waiting = null;
      show(next);
    };

    // how much longer the splash must stay up before this can replace it
    const holdLeft =
      splashSince === null || next.state.status === 'opening' ? 0 : splashSince + holdMs - now();
    if (holdLeft > 0) {
      entry.left += 1;
      entry.timer = setTimer(done, holdLeft);
    }
    const prepared = prepare?.(next);
    if (prepared) {
      entry.left += 1;
      prepared.then(done, done);
    }

    if (entry.left === 0) show(next);
    else waiting = entry;
  };

  // 1. what main said as the page loaded, shown at once
  const first = describe(initial ?? NO_WORKSPACE, true);
  newestVersion = first.version;
  // not waited for; a failure shows as the app's own (a route's error page)
  prepare?.(first)?.catch(() => {});
  shown = first;
  if (first.state.status === 'opening') splashSince = now();

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
    latest: () => waiting?.next ?? shown,
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

/** The workspace open in `shown`, or null while one is opening or none is. */
export function openWorkspaceIn(shown: ShownWorkspaceState): WorkspaceInfo | null {
  return shown.state.status === 'open' ? shown.state.workspace : null;
}

const NO_WORKSPACE: WorkspaceSnapshot = { version: 0, state: { status: 'none', error: null } };

/** The workspace state to show, re-rendering on each change. */
export function useWorkspaceState(store: WorkspaceStateStore): ShownWorkspaceState {
  return useSyncExternalStore(store.subscribe, store.get);
}
