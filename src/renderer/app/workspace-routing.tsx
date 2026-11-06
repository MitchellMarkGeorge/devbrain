import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useRouter } from '@tanstack/react-router';
import type { WorkspaceId } from '@common/ids';
import { ipcErrorCode } from '../ipc/errors';
import { useHeldFor, useOpeningWorkspace } from '../workspace-opening';
import { useServices, type RouterContext } from './context';
import { resolveLandingPage } from './landing-page';
import { SPLASH_MINIMUM_MS, Splash } from './Splash';

// The root's part in a workspace opening, closing, or vanishing under the page.

/** Marks that no workspace is open, so the guards send the next navigation to onboarding. */
export function forgetOpenWorkspace({ queryClient, trpc }: RouterContext): void {
  queryClient.setQueryData(trpc.workspaces.current.queryKey(), null);
}

/** Reads which workspace is open now, into the cache the `/app` guard reads, and returns it. */
export function refreshOpenWorkspace({ queryClient, trpc }: RouterContext) {
  return queryClient
    .fetchQuery({ ...trpc.workspaces.current.queryOptions(), staleTime: 0 })
    .catch(() => null);
}

/**
 * The switch splash over everything while a workspace opens, whoever started it (this window, the
 * menu, another window), with the name of the workspace opening.
 */
export function WorkspaceSwitchSplash() {
  const { events, trpc } = useServices();
  const opening = useOpeningWorkspace(events);
  const list = useQuery(trpc.workspaces.list.queryOptions());
  const held = useHeldFor(opening !== null, SPLASH_MINIMUM_MS);
  // kept while the splash is held past the open
  const [name, setName] = useState<string | null>(null);
  const openingName = list.data?.items.find(({ id }) => id === opening)?.name ?? null;
  if (opening !== null && openingName !== name) setName(openingName);
  return held ? <Splash overlay name={name} /> : null;
}

/**
 * Follows the open workspace with the URL:
 * - When a switch completes (`workspace.changed` says the new one is open and none is opening),
 *   goes to its landing page: the page it was on when it last closed, with "Reopen last page".
 * - When none is open any more (an open failed, the open one was deleted), goes to onboarding.
 * - When a call fails with `no_workspace_open` (the workspace closed under the page), and main
 *   confirms none is open, goes to onboarding.
 *
 * `/` is left alone: boot does its own redirect once `openLast` settles.
 */
export function useWorkspaceRouting(): void {
  const router = useRouter();
  const services = useServices();

  useEffect(() => {
    const { events, queryClient, ipc } = services;
    let opening: WorkspaceId | null = null;
    const booting = () => router.latestLocation.pathname === '/';
    const inApp = () => router.latestLocation.pathname.startsWith('/app');

    const toOnboarding = () => {
      forgetOpenWorkspace(services);
      void router.navigate({ to: '/onboarding', replace: true });
    };

    const stopEvents = events.on('workspace.changed', ({ id, opening: next }) => {
      const wasOpening = opening;
      opening = next;
      if (next !== null || booting()) return;
      if (id === null) {
        if (inApp()) toOnboarding();
        else forgetOpenWorkspace(services);
        return;
      }
      if (wasOpening === null) return;
      void (async () => {
        const opened = await refreshOpenWorkspace(services);
        const href = await resolveLandingPage(services, opened);
        await router.navigate({ href });
      })();
    });

    // a workspace closed under the page: its calls fail with no_workspace_open
    const onError = (error: unknown) => {
      if (ipcErrorCode(error) !== 'no_workspace_open' || opening !== null || !inApp()) return;
      // a call answered during a switch can fail after the new workspace opened: check first
      ipc.workspaces.current
        .query()
        .then((current) => {
          if (current === null && opening === null && inApp()) toOnboarding();
        })
        .catch(() => undefined);
    };
    const stopQueries = queryClient.getQueryCache().subscribe((event) => {
      if (event.type === 'updated' && event.action.type === 'error') onError(event.action.error);
    });
    const stopMutations = queryClient.getMutationCache().subscribe((event) => {
      if (event.type === 'updated' && event.action.type === 'error') onError(event.action.error);
    });

    return () => {
      stopEvents();
      stopQueries();
      stopMutations();
    };
  }, [router, services]);
}
