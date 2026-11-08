import { createRoot, type Root } from 'react-dom/client';
import { QueryClientProvider } from '@tanstack/react-query';
import { createMemoryHistory } from '@tanstack/react-router';
import { expect, vi } from 'vitest';
import type { InitialLoadContext } from '@common/ipc/types';
import { WindowFrameProvider } from '../../components/lib/platform';
import { events, ipc, queryClient, queryInvalidator, trpc } from '../../ipc';
import { seedQueryCache } from '../../ipc/initial-load-context';
import { createAppRouter, followOutsideChanges, type AppRouter } from '../../router';
import { AppWindow } from '../../pages/root/AppWindow';
import type { FakeMain } from './fake-main';

// The app as main.tsx starts it, over a fake main (fake-main.ts) and memory history: the real
// route tree, IPC client, query cache and invalidator. The window's first URL is the one main
// would give it.

export interface StartOptions {
  /** the window's first URL (its hash) */
  url: string;
  /** what the preload read; the fake main's own by default, null for none */
  initialLoadContext?: InitialLoadContext | null;
  /** the splash's minimum; 0 by default, so tests don't wait for it */
  splashMinimumMs?: number;
}

export interface App {
  router: AppRouter;
  container: HTMLElement;
  /** the window's current path, with search */
  path(): string;
  text(): string;
  stop(): void;
}

// the tests wait for the page rather than wrapping updates in act()
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = false;

let mounted: (() => void)[] = [];

export function startApp(main: FakeMain, options: StartOptions): App {
  const initialLoadContext =
    options.initialLoadContext === undefined
      ? main.initialLoadContext()
      : options.initialLoadContext;
  window.ipcBridge = main.bridge(initialLoadContext);
  queryClient.clear();
  seedQueryCache(queryClient, initialLoadContext);
  const stopInvalidator = queryInvalidator.listen(events);

  const router = createAppRouter({
    history: createMemoryHistory({ initialEntries: [options.url] }),
    context: {
      queryClient,
      trpc,
      ipc,
      splashMinimumMs: options.splashMinimumMs ?? 0,
    },
  });
  const stopFollowing = followOutsideChanges(router, events);

  const container = document.createElement('div');
  document.body.appendChild(container);
  const root: Root = createRoot(container);
  // no act(): the router and React Query update the page on their own schedule, and the tests
  // wait for what they expect to see (eventually)
  {
    root.render(
      <QueryClientProvider client={queryClient}>
        <WindowFrameProvider value={{ platform: 'macos', controls: 'system' }}>
          <AppWindow
            router={router}
            devBrainAvailable={initialLoadContext?.devBrainAvailable ?? true}
          />
        </WindowFrameProvider>
      </QueryClientProvider>,
    );
  }

  const stop = () => {
    root.unmount();
    container.remove();
    stopInvalidator();
    stopFollowing();
    delete window.ipcBridge;
  };
  mounted.push(stop);
  return {
    router,
    container,
    path: () => router.state.location.href,
    text: () => container.textContent ?? '',
    stop,
  };
}

/** Unmounts every app a test started. */
export function stopApps(): void {
  for (const stop of mounted) stop();
  mounted = [];
}

/** Waits for `assertion` to hold, as the app settles. */
export function eventually(assertion: () => void, timeout = 3000): Promise<void> {
  return vi.waitFor(assertion, { timeout, interval: 5 });
}

/** The splash, when it is on screen. */
export function splashOf(container: HTMLElement): HTMLElement | null {
  return container.querySelector('[data-testid="splash"]');
}

/** The text a user sees: what isn't inside an element React has hidden (`display: none`). */
export function visibleText(element: Element): string {
  if (element instanceof HTMLElement && element.style.display === 'none') return '';
  return [...element.childNodes]
    .map((node) =>
      node instanceof Element ? visibleText(node) : node.nodeType === 3 ? node.textContent : '',
    )
    .join('');
}

/**
 * Watches the window for text: records, in order, each time a node with any of `texts` is added,
 * and when the splash appears and goes. For "never drawn" checks.
 */
export function watchDom(container: HTMLElement, texts: string[]) {
  const log: { at: number; what: string }[] = [];
  const check = (node: Node) => {
    if (!(node instanceof HTMLElement || node instanceof Text)) return;
    if (node instanceof HTMLElement) {
      if (node.matches('[data-testid="splash"]') || node.querySelector('[data-testid="splash"]'))
        log.push({ at: Date.now(), what: 'splash+' });
    }
    const content = node.textContent ?? '';
    for (const text of texts) if (content.includes(text)) log.push({ at: Date.now(), what: text });
  };
  const observer = new MutationObserver((records) => {
    for (const record of records) {
      record.addedNodes.forEach(check);
      record.removedNodes.forEach((node) => {
        if (
          node instanceof HTMLElement &&
          (node.matches('[data-testid="splash"]') || node.querySelector('[data-testid="splash"]'))
        )
          log.push({ at: Date.now(), what: 'splash-' });
      });
    }
  });
  observer.observe(container, { childList: true, subtree: true, characterData: true });
  return {
    log,
    /** what was recorded after the first entry for `what` */
    after: (what: string) => log.slice(log.findIndex((entry) => entry.what === what) + 1),
    stop: () => observer.disconnect(),
    flush: () => {
      for (const record of observer.takeRecords()) record.addedNodes.forEach(check);
    },
  };
}

/**
 * The log shows the splash first, and `page` drawn only once the splash has gone for good (the
 * first load hands the splash from the root's pending view to the root itself, so it can be
 * added twice).
 */
export function expectSplashThenPage(log: { what: string }[], page: string): void {
  const whats = log.map((entry) => entry.what);
  expect(whats[0]).toBe('splash+');
  const lastSplash = whats.lastIndexOf('splash-');
  expect(lastSplash).toBeGreaterThan(0);
  expect(whats.indexOf(page)).toBeGreaterThan(lastSplash);
  expect(whats.slice(lastSplash).filter((what) => what === 'splash+')).toEqual([]);
}

/** Clicks an element as a user would, in act. */
export function click(element: Element | null): void {
  if (!element) throw new Error('Nothing to click');
  element.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true }));
  element.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
  element.dispatchEvent(new MouseEvent('pointerup', { bubbles: true }));
  element.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
  element.dispatchEvent(new MouseEvent('click', { bubbles: true }));
}

/** The first element matching `selector` whose text includes `text`. */
export function byText(root: ParentNode, selector: string, text: string): HTMLElement | null {
  return (
    [...root.querySelectorAll<HTMLElement>(selector)].find((element) =>
      (element.textContent ?? '').includes(text),
    ) ?? null
  );
}
