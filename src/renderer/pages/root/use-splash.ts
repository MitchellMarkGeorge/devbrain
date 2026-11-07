import { createContext, useContext, useEffect, useRef, useState } from 'react';
import { useRouterState } from '@tanstack/react-router';
import type { WorkspaceId } from '@common/ids';
import { workspaceIdOfPage } from '@common/types';
import type { AppRouter } from '../../router';

/** How long the splash shows at least, so a quick switch doesn't flicker. */
export const SPLASH_MINIMUM_MS = 600;

/**
 * Whether the router is on its way to another workspace: it is loading a location in a workspace
 * other than the one on screen (on the first load, other than the one open as the page loaded, so
 * a reload is no switch). SplashProvider shows the splash meanwhile.
 */
export function useSwitchingWorkspace(
  router: AppRouter,
  openAtStart: WorkspaceId | null = null,
): boolean {
  return useRouterState({
    router,
    select: (state) => {
      if (state.status !== 'pending') return false;
      const target = workspaceIdOfPage(state.location.pathname);
      const shown = state.resolvedLocation
        ? workspaceIdOfPage(state.resolvedLocation.pathname)
        : openAtStart;
      return target !== null && target !== shown;
    },
  });
}

/** True while `active` is, and for at least `minimumMs` from when it became so. */
export function useHeldFor(active: boolean, minimumMs: number): boolean {
  const [held, setHeld] = useState(active);
  const since = useRef<number | null>(null);
  if (active && !held) setHeld(true);
  useEffect(() => {
    if (active) {
      since.current ??= Date.now();
      return;
    }
    if (!held) return;
    const left = (since.current ?? 0) + minimumMs - Date.now();
    const timer = setTimeout(
      () => {
        since.current = null;
        setHeld(false);
      },
      Math.max(0, left),
    );
    return () => clearTimeout(timer);
  }, [active, held, minimumMs]);
  return held;
}

/** Whether the splash is up: SplashProvider gives it, and the root hides the page while it is. */
export const SplashVisible = createContext(false);

export function useSplashVisible(): boolean {
  return useContext(SplashVisible);
}
