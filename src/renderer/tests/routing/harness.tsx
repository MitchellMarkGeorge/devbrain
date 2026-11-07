import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { vi } from 'vitest';
import { QueryClientProvider } from '@tanstack/react-query';
import { createMemoryHistory, RouterProvider } from '@tanstack/react-router';
import type { AppEvents } from '@common/events';
import type { WorkspaceId } from '@common/ids';
import type {
  InitialLoadContext,
  IpcBridge,
  IpcErrorCode,
  IpcRequest,
  IpcResult,
} from '@common/ipc/types';
import type { AppSettings, WorkspaceInfo } from '@common/types';
import { createIpcServices } from '../../ipc';
import { seedQueryCache } from '../../ipc/initial-load-context';
import { createAppRouter, type AppRouter } from '../../router';
import { createWorkspaceStatus, initialWorkspaceStatus } from '../../app/workspace-status';

// The real route tree over memory history and a fake main: each call is answered by a handler
// by its path, and the test sends main's push events itself.

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
    id: `wsp_${name.toLowerCase()}` as WorkspaceId,
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

export function initialContext(overrides: Partial<InitialLoadContext> = {}): InitialLoadContext {
  return {
    devBrainAvailable: true,
    current: null,
    opening: null,
    openFailure: null,
    workspaces: { items: [], nextCursor: null },
    settings: settings(),
    ...overrides,
  };
}

const EMPTY_PAGE = { items: [], nextCursor: null };

// what every app page reads, so a test names only what it is about
const DEFAULT_HANDLERS: Handlers = {
  'app.version': () => '0.0.1',
  'settings.get': () => settings(),
  'workspaces.list': () => EMPTY_PAGE,
  'workspaces.current': () => null,
  'recents.list': () => EMPTY_PAGE,
  'favorites.list': () => EMPTY_PAGE,
};

export interface App {
  router: AppRouter;
  container: HTMLElement;
  invoke: ReturnType<typeof vi.fn<IpcBridge['invoke']>>;
  /** sends one of main's push events */
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
  at = '/',
  context = initialContext(),
  handlers = {},
}: {
  at?: string;
  context?: InitialLoadContext | null;
  handlers?: Handlers;
} = {}): App {
  const all: Handlers = {
    ...DEFAULT_HANDLERS,
    // main agrees with the context unless the test says otherwise
    'workspaces.status': () => initialWorkspaceStatus(context),
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

  const services = createIpcServices({ bridge });
  services.queryClient.setDefaultOptions({
    queries: { retry: false, refetchOnWindowFocus: false },
  });
  seedQueryCache(services.queryClient, context);
  services.queryInvalidator.listen(services.events);
  // as main.tsx does
  const workspaceStatus = createWorkspaceStatus({
    events: services.events,
    ipc: services.ipc,
    initial: initialWorkspaceStatus(context),
  });
  if (context?.devBrainAvailable !== false) void workspaceStatus.refresh();
  const router = createAppRouter(
    { ...services, initialLoadContext: context, workspaceStatus },
    createMemoryHistory({ initialEntries: [at] }),
  );

  const container = document.createElement('div');
  document.body.append(container);
  const root: Root = createRoot(container);
  act(() => {
    root.render(
      <QueryClientProvider client={services.queryClient}>
        <RouterProvider router={router} />
      </QueryClientProvider>,
    );
  });

  const app: App = {
    router,
    container,
    invoke,
    emit: (name, payload) => {
      act(() => listeners.get(name)?.forEach((listener) => listener(payload)));
    },
    calls: () => invoke.mock.calls.map(([request]) => request.path),
    inputs: (path) =>
      invoke.mock.calls.filter(([request]) => request.path === path).map(([r]) => r.input),
    text: () => document.body.textContent ?? '',
    unmount: () => {
      act(() => root.unmount());
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

/** The location the router is at: the path and its search, as `/app/tasks?view=board`. */
export function at(app: App): string {
  return app.router.state.location.href;
}
