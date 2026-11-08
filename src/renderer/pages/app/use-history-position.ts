import { useRouter, useRouterState } from '@tanstack/react-router';

/**
 * Whether the window's history has an entry before and after this one: the window bar's arrows,
 * and any other Back in the app. Use this rather than TanStack's `useCanGoBack` (experimental, and
 * with no forward counterpart). The router stamps each entry with its index (`__TSR_index`, typed
 * in @tanstack/history's `ParsedHistoryState`); the history's length counts the entries after it
 * too. tanstack-behaviour.test.ts checks both, so an upgrade that changes them fails there.
 */
export function useHistoryPosition(): { canGoBack: boolean; canGoForward: boolean } {
  const router = useRouter();
  const index = useRouterState({ select: (state) => state.location.state.__TSR_index ?? 0 });
  return { canGoBack: index > 0, canGoForward: index < router.history.length - 1 };
}
