import { useSyncExternalStore } from 'react';
import { useRouter, useRouterState } from '@tanstack/react-router';

/**
 * Back and Forward for the window bar, within the open workspace's pages: what `AppShell` takes as
 * `onBack`, `onForward`, `canGoBack` and `canGoForward`. Follows the location, and the session
 * (neither moves while the splash shows).
 */
export function useWorkspaceHistory() {
  const { session } = useRouter().options.context;
  const location = useRouterState({ select: (state) => state.location });
  useSyncExternalStore(session.subscribe, () => session.getState().busy);
  return {
    canGoBack: session.canGoBack(location),
    canGoForward: session.canGoForward(location),
    onBack: () => session.back(),
    onForward: () => session.forward(),
  };
}
