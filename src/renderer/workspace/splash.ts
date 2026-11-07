import { useSyncExternalStore } from 'react';
import { flushSync } from 'react-dom';
import type { WorkspaceId } from '@common/ids';

// The splash over the whole window while a workspace opens and its first page loads
// (docs/renderer/routing.md). The /app/$workspaceId route begins it just before it opens a
// workspace; the router settles it once the navigation has resolved (its loaders have run), and
// it hides after it has shown for at least `SPLASH_MINIMUM_MS`, so a quick switch doesn't flicker.
// The root route draws it in place of the page: the old workspace's page is gone from the
// moment the switch starts, so it is never drawn again, and its queries, no longer mounted, never
// refetch with the new workspace's data.

/** How long the splash shows at least. */
export const SPLASH_MINIMUM_MS = 600;

export interface SplashState {
  visible: boolean;
  /** the workspace opening, while known */
  workspace: { id: WorkspaceId; name: string | null } | null;
}

const HIDDEN: SplashState = { visible: false, workspace: null };

export class SplashGate {
  private state: SplashState = HIDDEN;
  private shownAt = 0;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private readonly listeners = new Set<() => void>();

  constructor(private readonly minimumMs = SPLASH_MINIMUM_MS) {}

  getSnapshot = (): SplashState => this.state;

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  /**
   * Shows the splash for the workspace opening, and draws it before returning: whatever was on
   * screen is unmounted by the time the open starts. A second switch while it shows only renames
   * it.
   */
  begin(workspace: { id: WorkspaceId; name: string | null }): void {
    this.clearTimer();
    if (!this.state.visible) this.shownAt = Date.now();
    // synchronous, so the page under it is gone before main hears of the open; outside a render,
    // as begin() is called from a route's beforeLoad
    flushSync(() => this.set({ visible: true, workspace }));
  }

  /** The navigation has resolved: hides the splash once it has shown for the minimum. */
  settle(): void {
    if (!this.state.visible || this.timer !== null) return;
    const left = this.shownAt + this.minimumMs - Date.now();
    if (left <= 0) {
      this.set(HIDDEN);
      return;
    }
    this.timer = setTimeout(() => {
      this.timer = null;
      this.set(HIDDEN);
    }, left);
  }

  private clearTimer() {
    if (this.timer !== null) clearTimeout(this.timer);
    this.timer = null;
  }

  private set(state: SplashState) {
    this.state = state;
    for (const listener of this.listeners) listener();
  }
}

/** The splash's state, re-rendering as it changes. */
export function useSplash(gate: SplashGate): SplashState {
  return useSyncExternalStore(gate.subscribe, gate.getSnapshot);
}
