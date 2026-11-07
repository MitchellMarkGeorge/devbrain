// @vitest-environment happy-dom
import { createElement } from 'react';
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
  navigate(options: { to: string }): Promise<void>;
  preloadRoute(options: { to: string }): Promise<unknown>;
  history: RouterHistory;
  state: { isLoading: boolean };
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
