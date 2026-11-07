import { createElement, useEffect } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createTRPCClient } from '@trpc/client';
import { createTRPCOptionsProxy } from '@trpc/tanstack-react-query';
import { createMemoryHistory, RouterProvider, type RouterHistory } from '@tanstack/react-router';
import type { AppEvents } from '@common/events';
import type { AppRouter } from '@main/ipc/router';
import { createEventClient } from '../../ipc/events';
import { ipcLink } from '../../ipc/link';
import { createQueryInvalidator } from '../../ipc/query-invalidator';
import { seedQueryCache } from '../../ipc/initial-load-context';
import { createAppRouter, SPLASH_MINIMUM_MS } from '../../router/routes';
import { WorkspaceSession } from '../../router/session';
import type { FakeMain } from './fake-main';

// The window over a FakeMain: the real IPC client, query cache, invalidator, session and route
// tree, as main.tsx puts them together, with memory history in place of hash history.

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = false;

export interface Drawn {
  at: number;
  // what was drawn: a page (its data-page) or the splash
  what: string;
  text: string;
}

export interface App {
  router: ReturnType<typeof createAppRouter>;
  session: WorkspaceSession;
  history: RouterHistory;
  container: HTMLElement;
  // every page or splash inserted, and every change inside a page, in order
  drawn: Drawn[];
  rootMounts: () => number;
  page: () => { path: string; text: string } | null;
  splash: () => boolean;
  unmount: () => void;
}

export function mountApp(
  main: FakeMain,
  { url = '/', history }: { url?: string; history?: RouterHistory } = {},
): App {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const events = createEventClient<AppEvents>({ bridge: main.bridge });
  const queryInvalidator = createQueryInvalidator({ queryClient, onError: () => {} });
  const ipc = createTRPCClient<AppRouter>({
    links: [
      ipcLink({ bridge: main.bridge, onChanged: (changed) => queryInvalidator.onChanged(changed) }),
    ],
  });
  const trpc = createTRPCOptionsProxy<AppRouter>({ client: ipc, queryClient });
  const initial = main.initialLoadContext();
  seedQueryCache(queryClient, initial);
  const stopInvalidator = queryInvalidator.listen(events);

  history ??= createMemoryHistory({ initialEntries: [url] });
  const stopTracking = main.track(history);
  const session = new WorkspaceSession({
    events,
    ipc,
    trpc,
    queryClient,
    queryInvalidator,
    initial,
    onError: () => {},
  });
  const router = createAppRouter(history, {
    queryClient,
    trpc,
    session,
    splashMinimumMs: SPLASH_MINIMUM_MS,
  });

  // how often the root route's shell mounts: the router and its root match never remount
  let rootMounts = 0;
  // shellComponent is a root route's own option, missing from the type routesById gives
  const rootRoute = router.routesById.__root__ as unknown as {
    options: { shellComponent: React.ComponentType<{ children: React.ReactNode }> };
    update: (options: object) => void;
  };
  const Shell = rootRoute.options.shellComponent;
  rootRoute.update({
    shellComponent: function CountedShell({ children }: { children: React.ReactNode }) {
      return createElement(Counted, null, createElement(Shell, null, children));
    },
  });
  function Counted({ children }: { children: React.ReactNode }) {
    // a ref-less mount counter: an effect with no deps runs once per mount
    useMountCount(() => {
      rootMounts++;
    });
    return children;
  }

  const stopSession = session.start(router);

  const container = document.createElement('div');
  document.body.append(container);
  const drawn: Drawn[] = [];
  const record = (element: Element, what: string) =>
    drawn.push({ at: Date.now(), what, text: element.textContent ?? '' });
  const observer = new MutationObserver((records) => {
    for (const mutation of records) {
      for (const node of mutation.addedNodes) {
        if (!(node instanceof Element)) continue;
        const elements = [node, ...node.querySelectorAll('*')];
        for (const element of elements) {
          if (element.hasAttribute('data-page'))
            record(element, element.getAttribute('data-page')!);
          if (element.hasAttribute('data-splash')) record(element, 'splash');
        }
      }
      // a change inside a page already drawn (its rows refetched)
      const target =
        mutation.target instanceof Element ? mutation.target : mutation.target.parentElement;
      const page = target?.closest('[data-page]');
      if (page && !mutation.addedNodes[0]?.isSameNode(page)) {
        record(page, `${page.getAttribute('data-page')} (changed)`);
      }
    }
  });
  observer.observe(container, { childList: true, subtree: true, characterData: true });

  const root: Root = createRoot(container);
  root.render(
    createElement(
      QueryClientProvider,
      { client: queryClient },
      createElement(RouterProvider, { router }),
    ),
  );

  return {
    router,
    session,
    history,
    container,
    drawn,
    rootMounts: () => rootMounts,
    page: () => {
      const page = container.querySelector('[data-page]');
      return page ? { path: page.getAttribute('data-page')!, text: page.textContent ?? '' } : null;
    },
    splash: () => container.querySelector('[data-splash]') !== null,
    unmount: () => {
      observer.disconnect();
      root.unmount();
      container.remove();
      stopSession();
      stopTracking();
      stopInvalidator();
      queryClient.clear();
    },
  };
}

function useMountCount(onMount: () => void) {
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(onMount, []);
}
