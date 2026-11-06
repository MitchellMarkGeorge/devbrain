import { useEffect } from 'react';
import { useCanGoBack, useRouter, useRouterState } from '@tanstack/react-router';
import { lastPageSchema } from '@common/types';
import { useServices } from './context';

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

// How long navigation has to be still before the page is saved: filters, the calendar's arrows
// and sheets rewrite the URL many times in a row, and each save writes the settings file.
export const LAST_PAGE_DEBOUNCE_MS = 1000;

/**
 * Saves the page the app is on for "Reopen last page" (settings.setLastPage), once navigation has
 * been still for a second. A location that resolved to not-found is not saved, nor one outside the
 * app. Saving when the window closes isn't reliable, so the last second of navigation can be lost.
 */
export function useSaveLastPage(): void {
  const router = useRouter();
  const { ipc, queryClient, trpc } = useServices();

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const save = () => {
      const { location, matches } = router.state;
      if (matches.some((match) => match.status === 'notFound')) return;
      const href = location.href;
      if (!lastPageSchema.safeParse(href).success) return;
      if (queryClient.getQueryData(trpc.settings.lastPage.queryKey()) === href) return;
      ipc.settings.setLastPage
        .mutate({ href })
        .then(() => queryClient.setQueryData(trpc.settings.lastPage.queryKey(), href))
        .catch(() => undefined);
    };
    const schedule = () => {
      clearTimeout(timer);
      timer = setTimeout(save, LAST_PAGE_DEBOUNCE_MS);
    };
    // the page the layout opened on counts too
    schedule();
    const unsubscribe = router.subscribe('onResolved', schedule);
    return () => {
      clearTimeout(timer);
      unsubscribe();
    };
  }, [router, ipc, queryClient, trpc]);
}
