import { useCanGoBack, useRouter, useRouterState } from '@tanstack/react-router';

/** Back and forward through the window's history, for `AppShell`'s arrows. */
export function useHistoryArrows() {
  const router = useRouter();
  const canGoBack = useCanGoBack();
  // the router numbers each entry it pushes; forward is possible while entries lie past this one
  const index = useRouterState({ select: (state) => state.location.state.__TSR_index ?? 0 });
  return {
    onBack: () => router.history.back(),
    onForward: () => router.history.forward(),
    canGoBack,
    canGoForward: index < router.history.length - 1,
  };
}
