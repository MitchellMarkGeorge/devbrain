// @vitest-environment happy-dom
import { afterEach, describe, expect, it } from 'vitest';
import { createElement, useState } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import {
  createHashHistory,
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  Outlet,
  redirect,
  RouterProvider,
  type RouterHistory,
} from '@tanstack/react-router';
import { lastPageSchema } from '@common/types';
import { gate } from './fake-main';

// What WorkspaceSession and the root route rely on in TanStack Router (1.170.46), checked here
// rather than taken from the docs. Each test names the behaviour.

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = false;
const WAIT = { timeout: 3000, interval: 5 };

let cleanups: (() => void)[] = [];
afterEach(() => {
  cleanups.forEach((cleanup) => cleanup());
  cleanups = [];
});

function setup(history: RouterHistory, options: { slow?: Promise<void>; render?: boolean } = {}) {
  const calls = { rootBeforeLoad: 0, slowLoader: 0, rootMounts: 0 };
  const root = createRootRoute({
    beforeLoad: () => {
      calls.rootBeforeLoad++;
    },
    component: function RootComponent() {
      // counts mounts: a state initialiser runs once per mount
      useOnce(() => calls.rootMounts++);
      return createElement(Outlet);
    },
  });
  const page = (path: string) =>
    createRoute({
      getParentRoute: () => root,
      path,
      component: () => createElement('div', { 'data-page': path }),
    });
  const slow = createRoute({
    getParentRoute: () => root,
    path: 'slow',
    loader: async () => {
      calls.slowLoader++;
      await options.slow;
    },
    component: () => createElement('div', { 'data-page': 'slow' }),
  });
  const away = createRoute({
    getParentRoute: () => root,
    path: 'away',
    beforeLoad: () => {
      throw redirect({ href: '/one', replace: true, state: { marker: 'kept' } as never });
    },
  });
  const router = createRouter({
    routeTree: root.addChildren([page('one'), page('two'), slow, away]),
    history,
  });
  const container = document.createElement('div');
  document.body.append(container);
  let reactRoot: Root | null = null;
  const render = () => {
    reactRoot = createRoot(container);
    reactRoot.render(createElement(RouterProvider, { router }));
  };
  if (options.render ?? true) render();
  cleanups.push(() => {
    reactRoot?.unmount();
    container.remove();
  });
  const drawn = () => container.querySelector('[data-page]')?.getAttribute('data-page') ?? null;
  return { router, calls, drawn, render };
}

function useOnce(fn: () => void) {
  useState(fn);
}

describe('TanStack Router behaviour the design relies on', () => {
  it("navigate() resolves only once the target's loader is done and its page is rendered", async () => {
    const slow = gate();
    const { router, drawn } = setup(createMemoryHistory({ initialEntries: ['/one'] }), {
      slow: slow.promise,
    });
    await expect.poll(drawn, WAIT).toBe('one');
    let resolved = false;
    const navigation = router.navigate({ href: '/slow' }).then(() => (resolved = true));
    await new Promise((resolve) => setTimeout(resolve, 200));
    expect(resolved).toBe(false);
    slow.open();
    await navigation;
    expect(drawn()).toBe('slow');
  });

  it("the root route's beforeLoad runs on every navigation, Back and Forward included", async () => {
    const { router, calls, drawn } = setup(createMemoryHistory({ initialEntries: ['/one'] }));
    await expect.poll(drawn, WAIT).toBe('one');
    const before = calls.rootBeforeLoad;
    await router.navigate({ href: '/two' });
    router.history.back();
    await expect.poll(drawn, WAIT).toBe('one');
    router.history.forward();
    await expect.poll(drawn, WAIT).toBe('two');
    expect(calls.rootBeforeLoad - before).toBe(3);
    // and the root component stays mounted throughout
    expect(calls.rootMounts).toBe(1);
  });

  it('a push gets the next __TSR_index; a redirect with replace keeps the index and takes its state', async () => {
    const history = createMemoryHistory({ initialEntries: ['/one'] });
    const { router, drawn } = setup(history);
    await expect.poll(drawn, WAIT).toBe('one');
    expect(history.location.state.__TSR_index).toBe(0);
    await router.navigate({ href: '/two' });
    expect(history.location.state.__TSR_index).toBe(1);
    await router.navigate({ href: '/away' });
    await expect.poll(() => history.location.pathname, WAIT).toBe('/one');
    expect(history.location.state.__TSR_index).toBe(2);
    expect((history.location.state as { marker?: string }).marker).toBe('kept');
    expect(history.length).toBe(3);
  });

  it('memory history runs no blocker on Back: why the design guards in beforeLoad instead', async () => {
    const history = createMemoryHistory({ initialEntries: ['/one', '/two'] });
    const { drawn } = setup(history);
    await expect.poll(drawn, WAIT).toBe('two');
    let asked = 0;
    history.block({
      blockerFn: () => {
        asked++;
        return true;
      },
      enableBeforeUnload: false,
    });
    history.back();
    await expect.poll(drawn, WAIT).toBe('one');
    expect(asked).toBe(0);
  });

  it("router.load() before RouterProvider mounts is not repeated by the provider's own load", async () => {
    const { router, calls, drawn, render } = setup(
      createMemoryHistory({ initialEntries: ['/slow'] }),
      {
        render: false,
      },
    );
    await router.load();
    render();
    await expect.poll(drawn, WAIT).toBe('slow');
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(calls.slowLoader).toBe(1);
  });

  it("hash history writes the location into the URL's hash, where main reads the last page", async () => {
    window.history.replaceState(null, '', '/index.html#/one');
    const history = createHashHistory();
    cleanups.push(() => history.destroy());
    const { router, drawn } = setup(history);
    await expect.poll(drawn, WAIT).toBe('one');
    await router.navigate({ href: '/two?view=board' });
    history.flush();
    expect(window.location.hash).toBe('#/two?view=board');
    // main's lastPageOf reads the hash without its '#', and keeps it when it is an /app page
    expect(window.location.hash.slice(1)).toBe('/two?view=board');
    expect(lastPageSchema.safeParse('/app/tasks?view=board').success).toBe(true);
    // the entry's index is in window.history.state, so it survives a reload
    expect((window.history.state as { __TSR_index: number }).__TSR_index).toBe(
      history.location.state.__TSR_index,
    );
  });

  it('a root shellComponent renders during the first load only when the root has pending UI and a beforeLoad, and never remounts', async () => {
    const firstLoad = async (pendingComponent?: () => null, beforeLoad?: () => void) => {
      const slow = gate();
      let shellMounts = 0;
      const root = createRootRoute({
        shellComponent: function Shell({ children }: { children: React.ReactNode }) {
          useOnce(() => shellMounts++);
          return createElement('main', { 'data-shell': '' }, children);
        },
        pendingComponent,
        pendingMs: 0,
        beforeLoad,
      });
      const page = (path: string, loader?: () => Promise<void>) =>
        createRoute({
          getParentRoute: () => root,
          path,
          loader,
          component: () => createElement('div', { 'data-page': path }),
        });
      const router = createRouter({
        routeTree: root.addChildren([page('slow', () => slow.promise), page('two')]),
        history: createMemoryHistory({ initialEntries: ['/slow'] }),
      });
      const container = document.createElement('div');
      document.body.append(container);
      const reactRoot = createRoot(container);
      reactRoot.render(createElement(RouterProvider, { router }));
      cleanups.push(() => {
        reactRoot.unmount();
        container.remove();
      });
      await new Promise((resolve) => setTimeout(resolve, 100));
      const shellWhileLoading = container.querySelector('[data-shell]') !== null;
      slow.open();
      await expect
        .poll(() => container.querySelector('[data-page]')?.getAttribute('data-page'), WAIT)
        .toBe('slow');
      await router.navigate({ href: '/two' });
      await expect
        .poll(() => container.querySelector('[data-page]')?.getAttribute('data-page'), WAIT)
        .toBe('two');
      return { shellWhileLoading, shellMounts };
    };
    expect(await firstLoad()).toEqual({ shellWhileLoading: false, shellMounts: 1 });
    // the root's pending UI is offered only while the root itself is still loading: with nothing
    // of its own to run, it is done at once (an internal detail, hence this test)
    expect(await firstLoad(() => null)).toEqual({ shellWhileLoading: false, shellMounts: 1 });
    expect(
      await firstLoad(
        () => null,
        () => {},
      ),
    ).toEqual({ shellWhileLoading: true, shellMounts: 1 });
  });

  it("a preload's location has no history index: the guard must skip preloads", async () => {
    const seen: { preload: boolean; index: number | undefined }[] = [];
    const root = createRootRoute({
      beforeLoad: ({ location, preload }) => {
        seen.push({ preload, index: location.state.__TSR_index });
      },
    });
    const page = (path: string) =>
      createRoute({ getParentRoute: () => root, path, component: () => null });
    const router = createRouter({
      routeTree: root.addChildren([page('one'), page('two')]),
      history: createMemoryHistory({ initialEntries: ['/one'] }),
    });
    await router.load();
    await router.preloadRoute({ href: '/two' } as never);
    expect(seen.find((call) => call.preload)).toEqual({ preload: true, index: undefined });
    expect(seen.find((call) => !call.preload)?.index).toBe(0);
  });

  // Why AppLayout shows its own pending page: the router's pending UI shows only when a navigation
  // enters a route with a new Suspense boundary. Between two routes that both have pending UI (or
  // with a default for every route), React keeps the old page through the transition.
  it.each([
    ['only the slow route has pending UI', 'route', 'pending'],
    ['both routes have pending UI', 'both', 'one'],
    ['every route has it, as a router default', 'default', 'one'],
  ] as const)('pending UI between sibling routes: %s', async (_, where, drawnWhileLoading) => {
    const slow = gate();
    const pending = () => createElement('div', { 'data-page': 'pending' });
    const root = createRootRoute();
    const one = createRoute({
      getParentRoute: () => root,
      path: 'one',
      ...(where === 'both' ? { pendingComponent: pending } : {}),
      component: () => createElement('div', { 'data-page': 'one' }),
    });
    const two = createRoute({
      getParentRoute: () => root,
      path: 'two',
      loader: () => slow.promise,
      ...(where === 'default' ? {} : { pendingComponent: pending, pendingMs: 50 }),
      component: () => createElement('div', { 'data-page': 'two' }),
    });
    const router = createRouter({
      routeTree: root.addChildren([one, two]),
      history: createMemoryHistory({ initialEntries: ['/one'] }),
      ...(where === 'default' ? { defaultPendingComponent: pending, defaultPendingMs: 50 } : {}),
    });
    const container = document.createElement('div');
    document.body.append(container);
    const reactRoot = createRoot(container);
    reactRoot.render(createElement(RouterProvider, { router }));
    cleanups.push(() => {
      reactRoot.unmount();
      container.remove();
    });
    const drawn = () => container.querySelector('[data-page]')?.getAttribute('data-page');
    await expect.poll(drawn, WAIT).toBe('one');
    void router.navigate({ href: '/two' });
    await new Promise((resolve) => setTimeout(resolve, 400));
    expect(drawn()).toBe(drawnWhileLoading);
    slow.open();
    await expect.poll(drawn, WAIT).toBe('two');
  });
});
