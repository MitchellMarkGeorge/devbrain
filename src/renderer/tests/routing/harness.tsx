import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { vi } from 'vitest';
import { QueryClientProvider } from '@tanstack/react-query';
import { createMemoryHistory, type RouterHistory } from '@tanstack/react-router';
import type { AppEvents } from '@common/events';
import type { WorkspaceId } from '@common/ids';
import type {
  InitialLoadContext,
  IpcBridge,
  IpcErrorCode,
  IpcRequest,
  IpcResult,
  SerializedError,
} from '@common/ipc/types';
import type { AppSettings, WorkspaceInfo, WorkspaceSnapshot, WorkspaceState } from '@common/types';
import { createIpcServices } from '../../ipc';
import { seedQueryCache } from '../../ipc/initial-load-context';
import { WindowContent } from '../../app/WindowContent';
import { createWorkspaceStateStore } from '../../app/workspace-state';
import { startApp } from '../../app/start-app';
import { createAppRouter, type AppRouter } from '../../router';
import type { Services } from '../../app/context';

// The window as main.tsx renders it, over a fake main: each call is answered by a handler by its
// path (`workspaces.state` with the context's snapshot, unless the test says otherwise), the test
// pushes main's workspace state and its other events, and memory history stands in for the
// window's hash.

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

/** A failure main answers with, thrown from a handler. */
export class MainError extends Error {
  constructor(
    readonly code: IpcErrorCode,
    message: string = code,
    readonly data: Record<string, unknown> = {},
  ) {
    super(message);
  }
}

export type Handlers = Record<string, (input: unknown) => unknown>;

export function workspace(name: string, overrides: Partial<WorkspaceInfo> = {}): WorkspaceInfo {
  return {
    id: `wsp_${name.toLowerCase().replace(/\W/g, '_')}` as WorkspaceId,
    name,
    color: '#00bc7d',
    path: `/devbrain/${name}`,
    createdAt: Date.UTC(2026, 2, 1),
    lastOpenedAt: null,
    lastPage: null,
    ...overrides,
  };
}

export function settings(general: Partial<AppSettings['general']> = {}): AppSettings {
  return {
    theme: 'system',
    devBrainPath: '/devbrain',
    general: {
      defaultLandingPage: 'home',
      launchOnStartup: false,
      openToLastPage: false,
      confirmBeforeDeleting: true,
      confirmBeforeArchiving: false,
      timeFormat: '12',
      ...general,
    },
    tasks: {
      defaultSort: 'priority',
      defaultPriority: 2 as AppSettings['tasks']['defaultPriority'],
      defaultDueDate: 'today',
      defaultView: 'list',
      showCompletedTasks: false,
    },
    calendar: {
      defaultEventDuration: '30m',
      firstDayOfWeek: 'monday',
      defaultView: 'week',
      hideWeekends: false,
    },
  };
}

// the workspace states, as a test writes them
export const none = (error: SerializedError | null = null): WorkspaceState => ({
  status: 'none',
  error,
});
export const opening = (workspace: WorkspaceInfo): WorkspaceState => ({
  status: 'opening',
  workspace,
});
export const open = (
  workspace: WorkspaceInfo,
  error: SerializedError | null = null,
): WorkspaceState => ({ status: 'open', workspace, error });

export function failure(code: IpcErrorCode, message: string = code): SerializedError {
  return { code, message, data: {} };
}

export function initialContext(
  state: WorkspaceState = none(),
  overrides: Partial<InitialLoadContext> = {},
): InitialLoadContext {
  const workspaces = state.status === 'none' ? [] : [state.workspace];
  return {
    devBrainAvailable: true,
    workspace: { version: 1, state },
    workspaces: { items: workspaces, nextCursor: null },
    settings: settings(),
    ...overrides,
  };
}

const EMPTY_PAGE = { items: [], nextCursor: null };

// what every page reads, so a test names only what it is about
const DEFAULT_HANDLERS: Handlers = {
  'app.version': () => '0.0.1',
  'settings.get': () => settings(),
  'workspaces.list': () => EMPTY_PAGE,
  'workspaces.current': () => null,
  'recents.list': () => EMPTY_PAGE,
  'favorites.list': () => EMPTY_PAGE,
};

export interface App {
  container: HTMLElement;
  /** the app's history, standing in for the window's hash */
  history: RouterHistory;
  /** the app's router */
  router: AppRouter;
  invoke: ReturnType<typeof vi.fn<IpcBridge['invoke']>>;
  /** main sends a new workspace state, whole, with the next version */
  push(state: WorkspaceState): void;
  /** sends one of main's other push events */
  emit<K extends keyof AppEvents>(name: K, payload: AppEvents[K]): void;
  /** the paths called, in order */
  calls(): string[];
  /** the inputs a path was called with */
  inputs(path: string): unknown[];
  text(): string;
  unmount(): void;
}

let mounted: App[] = [];

export function renderApp({
  hash = '/',
  context = initialContext(),
  handlers = {},
}: {
  /** where the window's hash is as the page loads: `/` on a cold start, a page on a reload */
  hash?: string;
  context?: InitialLoadContext | null;
  handlers?: Handlers;
} = {}): App {
  // what main has sent last, as the tracker keeps it
  let snapshot: WorkspaceSnapshot = context?.workspace ?? {
    version: 0,
    state: { status: 'none', error: null },
  };
  const all: Handlers = {
    ...DEFAULT_HANDLERS,
    // main agrees with the context unless the test says otherwise
    'workspaces.state': () => context?.workspace ?? { version: 0, state: none() },
    // the workspace open in what main has sent last
    'workspaces.current': () =>
      snapshot.state.status === 'open' ? snapshot.state.workspace : null,
    ...handlers,
  };
  const listeners = new Map<string, Set<(payload: unknown) => void>>();
  const invoke = vi.fn<IpcBridge['invoke']>(async (request: IpcRequest) => {
    const handler = all[request.path];
    try {
      if (!handler) throw new MainError('internal', `No handler for ${request.path}`);
      return { ok: true, data: await handler(request.input), changed: [] } as IpcResult<unknown>;
    } catch (error) {
      const failure =
        error instanceof MainError
          ? { code: error.code, message: error.message, data: error.data }
          : { code: 'internal' as const, message: String(error), data: {} };
      return {
        ok: false,
        error: { code: -32603, message: failure.message, data: failure },
        changed: [],
      };
    }
  });

  const send = (name: string, payload: unknown) =>
    listeners.get(name)?.forEach((listener) => listener(payload));

  const bridge: IpcBridge = {
    invoke,
    subscribe: (name, listener) => {
      const set = listeners.get(name) ?? new Set();
      listeners.set(name, set);
      set.add(listener);
      return () => set.delete(listener);
    },
    initialLoadContext: context,
    platform: 'darwin',
  };

  // as main.tsx does
  const ipcServices = createIpcServices({ bridge });
  ipcServices.queryClient.setDefaultOptions({
    queries: { retry: false, refetchOnWindowFocus: false },
  });
  seedQueryCache(ipcServices.queryClient, context);
  ipcServices.queryInvalidator.listen(ipcServices.events);
  const services: Services = { ...ipcServices, initialLoadContext: context };
  const history = createMemoryHistory({ initialEntries: [hash] });
  // as main.tsx makes it, over memory history in place of the hash
  const router: AppRouter = createAppRouter(services, history);
  const workspaceState = createWorkspaceStateStore({
    initial: context?.workspace ?? null,
    events: services.events,
    fetch:
      context?.devBrainAvailable === false
        ? undefined
        : () => services.ipc.workspaces.state.query(),
    prepare: (next) => startApp(router, next),
  });

  const container = document.createElement('div');
  document.body.append(container);
  const root: Root = createRoot(container);
  act(() => {
    root.render(
      <QueryClientProvider client={services.queryClient}>
        <WindowContent services={services} workspaceState={workspaceState} router={router} />
      </QueryClientProvider>,
    );
  });

  const app: App = {
    container,
    history,
    // during the splash, the app's: its location is the one the window keeps
    router,
    invoke,
    push: (state) => {
      snapshot = { version: snapshot.version + 1, state };
      // cloned, as IPC does
      const sent = structuredClone(snapshot);
      act(() => send('workspace.changed', sent));
    },
    emit: (name, payload) => act(() => send(name, payload)),
    calls: () => invoke.mock.calls.map(([request]) => request.path),
    inputs: (path) =>
      invoke.mock.calls.filter(([request]) => request.path === path).map(([r]) => r.input),
    text: () => document.body.textContent ?? '',
    unmount: () => {
      act(() => root.unmount());
      workspaceState.stop();
      container.remove();
      services.queryClient.clear();
    },
  };
  mounted.push(app);
  return app;
}

export function unmountAll(): void {
  mounted.forEach((app) => app.unmount());
  mounted = [];
  document.body.innerHTML = '';
}

/** Waits, flushing React, until `check` passes. */
export async function waitFor(check: () => void, timeoutMs = 2000): Promise<void> {
  const until = Date.now() + timeoutMs;
  for (;;) {
    try {
      check();
      return;
    } catch (error) {
      if (Date.now() > until) throw error;
    }
    await act(() => new Promise((resolve) => setTimeout(resolve, 10)));
  }
}

/** Where the app's router is: the path and its search, as `/app/tasks?view=board`. */
export function at(app: App): string {
  return app.router.state.location.href;
}

/** Whether the splash is up. */
export function splashShown(): boolean {
  return document.querySelector('[role="status"][aria-label^="Opening"]') !== null;
}
