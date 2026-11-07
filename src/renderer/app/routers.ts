import { createHashHistory, createMemoryHistory, type RouterHistory } from '@tanstack/react-router';
import { isValidLastPage, type AppSettings } from '@common/types';
import { createAppRouter, type AppRouter } from '../router';
import type { Services } from './context';
import { landingPage } from './landing-page';
import type { ShownWorkspaceState } from './workspace-state';

/**
 * The window's two routers, made once at startup over the same route tree:
 *
 * - `app`, over the window's hash history, shown while a workspace is open. The hash keeps the
 *   location across a reload, and main follows it for "Reopen last page"
 *   (src/main/runtime/last-page.ts).
 * - `onboarding`, over memory history, shown while none is open. Its pages navigate between each
 *   other without touching the hash.
 *
 * Only one is mounted at a time (WindowContent). Each is put where it should start, as its state
 * is shown, by `placeRouters`.
 */
export interface WindowRouters {
  app: AppRouter;
  onboarding: AppRouter;
}

export function createWindowRouters(
  services: Services,
  // tests pass memory history for both
  histories: { app?: RouterHistory; onboarding?: RouterHistory } = {},
): WindowRouters {
  return {
    app: createAppRouter(services, histories.app ?? createHashHistory()),
    onboarding: createAppRouter(
      services,
      histories.onboarding ?? createMemoryHistory({ initialEntries: ['/onboarding'] }),
    ),
  };
}

/**
 * Puts the router about to be shown where it should start. The workspace state store calls it for
 * each state it shows, before React renders that state, so a router never renders a location it is
 * about to leave.
 *
 * - `open`: the app's location stays when `keepPage` says it is this workspace's and it is a page
 *   in the app (a reload, or a failed switch back to the same workspace). Otherwise it is replaced
 *   with the workspace's landing page. Replacing, not pushing: Back never returns to a page of the
 *   splash's or of another workspace's.
 * - `none`: onboarding starts again at Welcome.
 *
 * Each is then loaded, while unmounted: the router keeps its state between mounts, and only loads
 * on a remount when nothing is in flight, so a load cut short by the splash would otherwise leave
 * it on the old page. Loading it here means it renders the new page, with its loaders run, from
 * the first frame it shows.
 */
export function placeRouters(
  routers: WindowRouters,
  shown: ShownWorkspaceState,
  settings: AppSettings | null | undefined,
): void {
  const { state } = shown;
  switch (state.status) {
    case 'open': {
      const { history } = routers.app;
      const here = `${history.location.pathname}${history.location.search}`;
      if (!(shown.keepPage && isValidLastPage(here))) {
        history.replace(landingPage(settings, state.workspace));
      }
      void routers.app.load();
      return;
    }
    case 'none':
      routers.onboarding.history.replace('/onboarding');
      void routers.onboarding.load();
      return;
    case 'opening':
      // the splash has no router; the hash still shows the old workspace's page, which main saves
      // for it as it closes
      return;
  }
}
