// @vitest-environment happy-dom
import { createElement, useEffect } from 'react';
import { createRoot } from 'react-dom/client';
import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  Outlet,
  redirect,
  RouterProvider,
  type AnyRoute,
  type RouterHistory,
} from '@tanstack/react-router';
import { afterEach, describe, expect, it, vi } from 'vitest';

// What docs/renderer/routing.md relies on in @tanstack/react-router, checked against the version
// installed: some of it is documented, some is how this version happens to work. When one of these
// fails after an upgrade, read that section of the note before changing the test.

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = false;

let cleanups: (() => void)[] = [];
afterEach(() => {
  for (const cleanup of cleanups) cleanup();
  cleanups = [];
});

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((r) => (resolve = r));
  return { promise, resolve };
}

// a page that says `value`
const text = (value: string) => {
  const Page = () => createElement('p', null, value);
  Page.displayName = `Text(${value})`;
  return Page;
};
const wait = (ms = 20) => new Promise((resolve) => setTimeout(resolve, ms));

// The router's types are the app's (Register in src/renderer/router.tsx); these trees are not
interface TestRouter {
  navigate(options: { to: string; replace?: boolean }): Promise<void>;
  preloadRoute(options: { to: string }): Promise<unknown>;
  history: RouterHistory;
  state: {
    isLoading: boolean;
    location: { pathname: string; state: { __TSR_index?: number } };
    resolvedLocation?: { pathname: string };
  };
  subscribe(event: 'onResolved', listener: (event: { toLocation: { href: string } }) => void): void;
}

function mount(routeTree: AnyRoute, url = '/') {
  const created = createRouter({
    routeTree,
    history: createMemoryHistory({ initialEntries: [url] }),
  });
  const router = created as unknown as TestRouter;
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  root.render(createElement(RouterProvider, { router: created }));
  cleanups.push(() => {
    root.unmount();
    container.remove();
  });
  return { router, container };
}

describe('@tanstack/react-router, as the app relies on it', () => {
  it('navigate() resolves once the target’s loaders are done and its page is rendered', async () => {
    const slow = deferred();
    const rootRoute = createRootRoute({ component: Outlet });
    const tree = rootRoute.addChildren([
      createRoute({ getParentRoute: () => rootRoute, path: '/', component: text('index') }),
      createRoute({
        getParentRoute: () => rootRoute,
        path: '/slow',
        loader: () => slow.promise,
        component: text('slow page'),
      }),
    ]);
    const { router, container } = mount(tree);
    await vi.waitFor(() => expect(container.textContent).toBe('index'));
    let done = false;
    const navigation = router.navigate({ to: '/slow' }).then(() => (done = true));
    await wait();
    expect(done).toBe(false);
    slow.resolve();
    await navigation;
    expect(container.textContent).toBe('slow page');
  });

  it("runs the root's beforeLoad on every navigation, Back and Forward included", async () => {
    const beforeLoad = vi.fn();
    const rootRoute = createRootRoute({ component: Outlet, beforeLoad });
    const tree = rootRoute.addChildren([
      createRoute({ getParentRoute: () => rootRoute, path: '/', component: text('a') }),
      createRoute({ getParentRoute: () => rootRoute, path: '/b', component: text('b') }),
    ]);
    const { router, container } = mount(tree);
    await vi.waitFor(() => expect(container.textContent).toBe('a'));
    await router.navigate({ to: '/b' });
    router.history.back();
    await vi.waitFor(() => expect(container.textContent).toBe('a'));
    router.history.forward();
    await vi.waitFor(() => expect(container.textContent).toBe('b'));
    expect(beforeLoad).toHaveBeenCalledTimes(4);
  });

  it('draws nothing on the first load until loaders finish, unless the root has a pendingComponent and a beforeLoad', async () => {
    const tree = (withRootPending: boolean, gate: Promise<void>) => {
      const rootRoute = createRootRoute({
        component: Outlet,
        ...(withRootPending
          ? {
              beforeLoad: () => {},
              pendingComponent: text('splash'),
              pendingMs: 0,
              pendingMinMs: 0,
            }
          : { pendingComponent: text('splash'), pendingMs: 0, pendingMinMs: 0 }),
      });
      return rootRoute.addChildren([
        createRoute({
          getParentRoute: () => rootRoute,
          path: '/',
          loader: () => gate,
          component: text('page'),
        }),
      ]);
    };
    const without = deferred();
    const a = mount(tree(false, without.promise));
    const withPending = deferred();
    const b = mount(tree(true, withPending.promise));
    await wait();
    expect(a.container.textContent).toBe('');
    expect(b.container.textContent).toBe('splash');
    without.resolve();
    withPending.resolve();
    await vi.waitFor(() => expect(a.container.textContent).toBe('page'));
    await vi.waitFor(() => expect(b.container.textContent).toBe('page'));
  });

  it("shows a slow sibling's pendingComponent after its pendingMs, hiding the old page", async () => {
    const slow = deferred();
    const rootRoute = createRootRoute({ component: Outlet });
    const tree = rootRoute.addChildren([
      createRoute({
        getParentRoute: () => rootRoute,
        path: '/',
        component: text('first'),
        pendingComponent: text('pending'),
      }),
      createRoute({
        getParentRoute: () => rootRoute,
        path: '/next',
        loader: () => slow.promise,
        component: text('next'),
        pendingComponent: text('pending'),
        pendingMs: 0,
      }),
    ]);
    const { router, container } = mount(tree);
    await vi.waitFor(() => expect(container.textContent).toBe('first'));
    const navigation = router.navigate({ to: '/next' });
    await wait(50);
    // React's Suspense keeps the old page in the DOM, hidden, and draws the fallback
    const [first, pending] = [...container.querySelectorAll('p')];
    expect(first.textContent).toBe('first');
    expect(first.style.display).toBe('none');
    expect(pending.textContent).toBe('pending');
    expect(router.state.isLoading).toBe(true);
    slow.resolve();
    await navigation;
    expect(container.textContent).toBe('next');
  });

  it('loads a route again when its params change, showing its pendingComponent for pendingMinMs while the old page stays mounted, hidden, and is then reused', async () => {
    const slow = deferred();
    let unmounted = 0;
    const rootRoute = createRootRoute({ component: Outlet });
    const Space = () => {
      useEffect(
        () => () => {
          unmounted += 1;
        },
        [],
      );
      return createElement('p', null, 'space page');
    };
    const tree = rootRoute.addChildren([
      createRoute({
        getParentRoute: () => rootRoute,
        path: '/space/$id',
        beforeLoad: ({ params }) => (params.id === 'b' ? slow.promise : undefined),
        component: Space,
        pendingComponent: text('pending'),
        pendingMs: 0,
        pendingMinMs: 200,
      }),
    ]);
    const { router, container } = mount(tree, '/space/a');
    await vi.waitFor(() => expect(container.textContent).toBe('space page'));
    const started = Date.now();
    const navigation = router.navigate({ to: '/space/b' });
    await wait(50);
    const [old, pending] = [...container.querySelectorAll('p')];
    expect(old.style.display).toBe('none');
    expect(pending.textContent).toBe('pending');
    expect(unmounted).toBe(0);
    slow.resolve();
    // navigate() waits for the pending component's minimum
    await navigation;
    expect(Date.now() - started).toBeGreaterThanOrEqual(195);
    await vi.waitFor(() => expect(container.textContent).toBe('space page'));
    // the same page, never unmounted: shown again for the new params (remountDeps would change that)
    expect(unmounted).toBe(0);
  });

  it("shows a child route's pendingComponent on the first load, unless the root has a beforeLoad", async () => {
    const tree = (rootBeforeLoad: boolean, gate: Promise<void>) => {
      const rootRoute = createRootRoute({
        component: Outlet,
        ...(rootBeforeLoad ? { beforeLoad: () => {} } : {}),
      });
      return rootRoute.addChildren([
        createRoute({
          getParentRoute: () => rootRoute,
          path: '/',
          beforeLoad: () => gate,
          pendingComponent: text('splash'),
          pendingMs: 0,
          pendingMinMs: 0,
          component: text('page'),
        }),
      ]);
    };
    const plain = deferred();
    const a = mount(tree(false, plain.promise));
    const guarded = deferred();
    const b = mount(tree(true, guarded.promise));
    await wait(50);
    expect(a.container.textContent).toBe('splash');
    expect(b.container.textContent).toBe('');
    plain.resolve();
    guarded.resolve();
    await vi.waitFor(() => expect(a.container.textContent).toBe('page'));
    await vi.waitFor(() => expect(b.container.textContent).toBe('page'));
  });

  it('with pendingMs 0, shows a new match’s pendingComponent even when its load is instant; with more, not', async () => {
    const tree = (pendingMs: number, seen: string[]) => {
      const rootRoute = createRootRoute({ component: Outlet });
      const Pending = () => {
        seen.push('pending');
        return createElement('p', null, 'pending');
      };
      return rootRoute.addChildren([
        createRoute({ getParentRoute: () => rootRoute, path: '/', component: text('home') }),
        createRoute({
          getParentRoute: () => rootRoute,
          path: '/space',
          beforeLoad: async () => {},
          pendingComponent: Pending,
          pendingMs,
          pendingMinMs: 0,
          component: text('space'),
        }),
      ]);
    };
    for (const [pendingMs, shows] of [
      [0, true],
      [50, false],
    ] as const) {
      const seen: string[] = [];
      const { router, container } = mount(tree(pendingMs, seen));
      await vi.waitFor(() => expect(container.textContent).toBe('home'));
      await router.navigate({ to: '/space' });
      await vi.waitFor(() => expect(container.textContent).toBe('space'));
      expect(seen.length > 0).toBe(shows);
    }
  });

  it('moves state.location as a navigation starts, and resolvedLocation once it has loaded', async () => {
    const slow = deferred();
    const rootRoute = createRootRoute({ component: Outlet });
    const tree = rootRoute.addChildren([
      createRoute({ getParentRoute: () => rootRoute, path: '/', component: text('index') }),
      createRoute({
        getParentRoute: () => rootRoute,
        path: '/slow',
        beforeLoad: () => slow.promise,
        component: text('slow page'),
      }),
    ]);
    const { router, container } = mount(tree);
    await vi.waitFor(() => expect(container.textContent).toBe('index'));
    const navigation = router.navigate({ to: '/slow' });
    await wait();
    expect(router.state.location.pathname).toBe('/slow');
    expect(router.state.resolvedLocation?.pathname).toBe('/');
    slow.resolve();
    await navigation;
    expect(router.state.resolvedLocation?.pathname).toBe('/slow');
  });

  it('stops a preload at a beforeLoad that throws: no loader below runs, and nothing is logged', async () => {
    const loader = vi.fn();
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
    const rootRoute = createRootRoute({ component: Outlet });
    const layout = createRoute({
      getParentRoute: () => rootRoute,
      path: '/w',
      beforeLoad: ({ preload }) => {
        if (preload) throw new Error('skipped');
      },
      component: Outlet,
    });
    const tree = rootRoute.addChildren([
      createRoute({ getParentRoute: () => rootRoute, path: '/', component: text('a') }),
      layout.addChildren([
        createRoute({ getParentRoute: () => layout, path: '/page', loader, component: text('p') }),
      ]),
    ]);
    const { router, container } = mount(tree);
    await vi.waitFor(() => expect(container.textContent).toBe('a'));
    await router.preloadRoute({ to: '/w/page' });
    expect(loader).not.toHaveBeenCalled();
    expect(consoleError).not.toHaveBeenCalled();
    consoleError.mockRestore();
    // and the real navigation runs it as usual
    await router.navigate({ to: '/w/page' });
    expect(loader).toHaveBeenCalledOnce();
  });

  it('stamps each history entry with its index (__TSR_index), and counts the entries after it in history.length', async () => {
    const rootRoute = createRootRoute({ component: Outlet });
    const tree = rootRoute.addChildren(
      ['/', '/a', '/b', '/c'].map((path) =>
        createRoute({ getParentRoute: () => rootRoute, path, component: text(path) }),
      ),
    );
    const { router, container } = mount(tree);
    await vi.waitFor(() => expect(container.textContent).toBe('/'));
    const position = () => [router.state.location.state.__TSR_index, router.history.length];
    expect(position()).toEqual([0, 1]);
    await router.navigate({ to: '/a' });
    await router.navigate({ to: '/b' });
    expect(position()).toEqual([2, 3]);
    // Back keeps the entries after it
    router.history.back();
    await vi.waitFor(() => expect(container.textContent).toBe('/a'));
    expect(position()).toEqual([1, 3]);
    // a new navigation drops them
    await router.navigate({ to: '/c' });
    expect(position()).toEqual([2, 3]);
    // replace keeps the index
    await router.navigate({ to: '/a', replace: true });
    expect(position()).toEqual([2, 3]);
  });

  it('gives a preload a location without a history index', async () => {
    const seen: { preload: boolean; index: unknown }[] = [];
    const rootRoute = createRootRoute({ component: Outlet });
    const tree = rootRoute.addChildren([
      createRoute({ getParentRoute: () => rootRoute, path: '/', component: text('a') }),
      createRoute({
        getParentRoute: () => rootRoute,
        path: '/b',
        beforeLoad: ({ preload, location }) => {
          seen.push({ preload, index: location.state.__TSR_index });
        },
        component: text('b'),
      }),
    ]);
    const { router, container } = mount(tree);
    await vi.waitFor(() => expect(container.textContent).toBe('a'));
    await router.preloadRoute({ to: '/b' });
    await router.navigate({ to: '/b' });
    expect(seen).toEqual([
      { preload: true, index: undefined },
      { preload: false, index: 1 },
    ]);
  });

  it("moves the URL before the target's beforeLoad runs (main sees the next workspace's page before the old one closes)", async () => {
    const urls: string[] = [];
    const rootRoute = createRootRoute({ component: Outlet });
    const app: { router?: TestRouter } = {};
    const tree = rootRoute.addChildren([
      createRoute({ getParentRoute: () => rootRoute, path: '/', component: text('a') }),
      createRoute({
        getParentRoute: () => rootRoute,
        path: '/b',
        beforeLoad: () => {
          urls.push(app.router!.history.location.pathname);
        },
        component: text('b'),
      }),
    ]);
    const mounted = mount(tree);
    app.router = mounted.router;
    await vi.waitFor(() => expect(mounted.container.textContent).toBe('a'));
    await app.router.navigate({ to: '/b' });
    expect(urls).toEqual(['/b']);
  });

  it('emits onResolved for the last of several navigations only, and once after a redirect', async () => {
    const gate = deferred();
    const rootRoute = createRootRoute({ component: Outlet });
    const tree = rootRoute.addChildren([
      createRoute({ getParentRoute: () => rootRoute, path: '/', component: text('a') }),
      createRoute({
        getParentRoute: () => rootRoute,
        path: '/slow',
        loader: () => gate.promise,
        component: text('slow'),
      }),
      createRoute({
        getParentRoute: () => rootRoute,
        path: '/go',
        beforeLoad: () => {
          throw redirect({ href: '/c?view=board' });
        },
      }),
      createRoute({ getParentRoute: () => rootRoute, path: '/c', component: text('c') }),
    ]);
    const { router, container } = mount(tree);
    await vi.waitFor(() => expect(container.textContent).toBe('a'));
    const resolved: string[] = [];
    router.subscribe('onResolved', (event) => resolved.push(event.toLocation.href));

    void router.navigate({ to: '/slow' });
    await wait();
    await router.navigate({ to: '/go' });
    gate.resolve();
    await wait();
    // the slow navigation, superseded, never resolved; the redirect landed on its href, search
    // and all, and resolved once
    expect(resolved).toEqual(['/c?view=board']);
    expect(container.textContent).toBe('c');
  });

  it('runs no blockers on Back and Forward with memory history', async () => {
    const rootRoute = createRootRoute({ component: Outlet });
    const tree = rootRoute.addChildren([
      createRoute({ getParentRoute: () => rootRoute, path: '/', component: text('a') }),
      createRoute({ getParentRoute: () => rootRoute, path: '/b', component: text('b') }),
    ]);
    const { router, container } = mount(tree);
    await vi.waitFor(() => expect(container.textContent).toBe('a'));
    await router.navigate({ to: '/b' });
    const blocker = vi.fn(() => true);
    const unblock = router.history.block({ blockerFn: blocker });
    router.history.back();
    await vi.waitFor(() => expect(container.textContent).toBe('a'));
    expect(blocker).not.toHaveBeenCalled();
    unblock();
  });
});
