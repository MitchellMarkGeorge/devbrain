import { isValidLastPage } from '@common/types';
import type { AppRouter } from '../router';
import type { ShownWorkspaceState } from './workspace-state';

/**
 * Gets the app's router ready for a workspace that is about to show. The workspace state store
 * calls it (`prepare`) for each state, and keeps the splash up until the promise it returns
 * settles, so the app appears already on the new workspace's page.
 *
 * - The location stays when `keepPage` says it is this workspace's and it is a page in the app (a
 *   reload, or a failed switch back to the same workspace).
 * - Otherwise it is replaced with `/`, whose route redirects to the workspace's landing page
 *   (routes/index.tsx). Replacing, not pushing: Back never returns to another workspace's page.
 *
 * Then the router is loaded. It isn't mounted during the splash, so it doesn't hear the location
 * change, and mounting it again doesn't load it (RouterProvider only loads on mount for a router
 * that has never loaded). Until the load commits it still holds the previous workspace's page,
 * which is why the splash waits for it.
 *
 * Resolves on the router's `onLoad`, which fires as the new page's matches commit, mounted or not.
 * (`router.load()` itself only settles once a mounted RouterProvider has rendered the result, so
 * it can't be awaited while unmounted.) `/` never commits, as it redirects, so the first `onLoad`
 * is the page the workspace lands on; one from a newer load also resolves it, which the store then
 * ignores as stale.
 */
export function startApp(router: AppRouter, shown: ShownWorkspaceState): Promise<void> | undefined {
  if (shown.state.status !== 'open') return undefined;
  const { pathname, search } = router.history.location;
  if (!(shown.keepPage && isValidLastPage(`${pathname}${search}`))) router.history.replace('/');
  const loaded = new Promise<void>((resolve) => {
    const stop = router.subscribe('onLoad', () => {
      stop();
      resolve();
    });
  });
  void router.load();
  return loaded;
}
