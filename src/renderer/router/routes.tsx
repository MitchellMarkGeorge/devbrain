import { useSyncExternalStore, type ReactNode } from 'react';
import {
  createRootRouteWithContext,
  createRoute,
  createRouter,
  Outlet,
  redirect,
  useRouter,
  useRouterState,
  type RouterHistory,
} from '@tanstack/react-router';
import type { QueryClient } from '@tanstack/react-query';
import { useQuery } from '@tanstack/react-query';
import type { TRPCOptionsProxy } from '@trpc/tanstack-react-query';
import type { AppSettings } from '@common/types';
import type { AppRouter } from '@main/ipc/router';
import { Logomark, OnboardingScreen } from '../components';
import { useHeldFor } from '../workspace-opening';
import type { WorkspaceSession } from './session';

// The route tree (code-based here; the plan's file routes give the same tree). The placeholder
// pages stand in for the real ones: each loads a list, so a switch waits for a loader.

export interface RouterContext {
  queryClient: QueryClient;
  trpc: TRPCOptionsProxy<AppRouter>;
  session: WorkspaceSession;
  // how long the splash shows at least, so a quick switch doesn't flicker
  splashMinimumMs: number;
}

export const SPLASH_MINIMUM_MS = 600;

const rootRoute = createRootRouteWithContext<RouterContext>()({
  // every navigation, Back and Forward included: a location that doesn't belong to what is open
  // goes to its first page
  beforeLoad: ({ context, location }) => context.session.guard(location),
  // the splash, around the whole tree rather than inside it
  shellComponent: SplashGate,
  // On its first load the router renders nothing, the shell included, until the loaders are done,
  // unless the root has pending UI to show meanwhile. This empty one lets the shell draw the
  // splash during it (a reload onto a slow page).
  pendingComponent: () => null,
  pendingMs: 0,
});

// While a workspace opens and its page loads, the splash in place of the route tree: the old page
// is unmounted from the first frame, and the new one mounts with its data. The shell renders
// outside the root route's own pending boundary, so one splash covers the router's first load too.
function SplashGate({ children }: { children: ReactNode }) {
  const { session, splashMinimumMs } = useRouter().options.context;
  const busy = useSyncExternalStore(session.subscribe, () => session.getState().busy);
  const splash = useHeldFor(busy, splashMinimumMs);
  return splash ? <Splash /> : children;
}

function Splash() {
  return <OnboardingScreen data-splash logo={<Logomark size="lg" pulse />} />;
}

// where the window starts (an empty hash): the splash shows while the last workspace reopens
const indexRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/',
  component: () => null,
});

const onboardingRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/onboarding',
  loader: ({ context: { queryClient, trpc } }) =>
    queryClient.ensureQueryData(trpc.workspaces.list.queryOptions()),
  component: Welcome,
});

function Welcome() {
  const { trpc, session } = rootRoute.useRouteContext();
  const list = useQuery(trpc.workspaces.list.queryOptions());
  const { failed } = useSyncExternalStore(session.subscribe, session.getState);
  return (
    <div data-page="/onboarding">
      {failed && <p data-failed={failed}>The workspace couldn’t be opened.</p>}
      {list.data?.items.map((w) => (
        <p key={w.id}>{w.name}</p>
      ))}
    </div>
  );
}

const appRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/app',
  component: AppLayout,
});

// stands in for AppShell: Back and Forward stay within the open workspace's pages
function AppLayout() {
  const router = useRouter();
  const { session } = rootRoute.useRouteContext();
  const location = useRouterState({ select: (state) => state.location });
  return (
    <div data-layout="app">
      <button
        data-back
        disabled={!session.canGoBack(location)}
        onClick={() => session.canGoBack(router.latestLocation) && router.history.back()}
      >
        Back
      </button>
      <Outlet />
    </div>
  );
}

const appIndexRoute = createRoute({
  getParentRoute: () => appRoute,
  path: '/',
  beforeLoad: async ({ context: { queryClient, trpc } }) => {
    const settings = await queryClient.fetchQuery(trpc.settings.get.queryOptions());
    throw redirect({ to: `/app/${settings.general.defaultLandingPage}`, replace: true });
  },
});

// A list page: its loader primes the cache, so it draws its rows on the first frame
function listPage(path: AppSettings['general']['defaultLandingPage'], limit: number) {
  const route = createRoute({
    getParentRoute: () => appRoute,
    path,
    loader: ({ context: { queryClient, trpc } }) =>
      queryClient.ensureQueryData(trpc.tasks.list.queryOptions({ limit })),
    component: function ListPage() {
      const { trpc } = rootRoute.useRouteContext();
      const tasks = useQuery(trpc.tasks.list.queryOptions({ limit }));
      return (
        <div data-page={`/app/${path}`}>
          {tasks.data?.items.map((task) => (
            <p key={task.id}>{task.title}</p>
          ))}
        </div>
      );
    },
  });
  return route;
}

export const routeTree = rootRoute.addChildren([
  indexRoute,
  onboardingRoute,
  appRoute.addChildren([
    appIndexRoute,
    listPage('home', 5),
    listPage('tasks', 50),
    listPage('notes', 20),
    listPage('projects', 20),
    listPage('calendar', 20),
  ]),
]);

export function createAppRouter(history: RouterHistory, context: RouterContext) {
  return createRouter({
    routeTree,
    history,
    context,
    // React Query decides freshness; the router keeps no cache of its own
    defaultPreloadStaleTime: 0,
  });
}

export type AppRouterInstance = ReturnType<typeof createAppRouter>;

declare module '@tanstack/react-router' {
  interface Register {
    router: AppRouterInstance;
  }
}
