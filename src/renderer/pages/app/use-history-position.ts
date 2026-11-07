import { useRouter, useRouterState } from '@tanstack/react-router';

/**
 * Whether the window's history has an entry before and after this one, for the window bar's back
 * and forward arrows. The router stamps each entry with its index (`__TSR_index`); the history's
 * length counts the entries after it too.
 */
export function useHistoryPosition(): { canGoBack: boolean; canGoForward: boolean } {
  const router = useRouter();
  const index = useRouterState({ select: (state) => state.location.state.__TSR_index ?? 0 });
  return { canGoBack: index > 0, canGoForward: index < router.history.length - 1 };
}
