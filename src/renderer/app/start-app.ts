import { isValidLastPage } from '@common/types';
import type { AppRouter } from '../router';
import type { ShownWorkspaceState } from './workspace-state';

/**
 * Starts the app's router for a workspace that is about to show, before React renders it. The
 * workspace state store calls it (`onShow`) with each `open` state it shows.
 *
 * - The location stays when `keepPage` says it is this workspace's and it is a page in the app (a
 *   reload, or a failed switch back to the same workspace).
 * - Otherwise it is replaced with `/`, whose route redirects to the workspace's landing page
 *   (routes/index.tsx). Replacing, not pushing: Back never returns to another workspace's page.
 *
 * Then the router is loaded. It is not mounted during the splash, so it doesn't hear the location
 * change, and remounting it doesn't load it again: without this it would show the page it showed
 * last. Loaded here, it renders the right page from its first frame.
 */
export function startApp(router: AppRouter, shown: ShownWorkspaceState): void {
  if (shown.state.status !== 'open') return;
  const { pathname, search } = router.history.location;
  if (!(shown.keepPage && isValidLastPage(`${pathname}${search}`))) router.history.replace('/');
  void router.load();
}
