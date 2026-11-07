import { lazy, Suspense, useState } from 'react';
import {
  Outlet,
  useRouter,
  useRouterState,
  type ErrorComponentProps,
} from '@tanstack/react-router';
import { workspaceIdOfPage } from '@common/types';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { RotateCw, ScrollText } from 'lucide-react';
import { Button, Logomark, OnboardingScreen, ToastProvider } from '../../components';
import { trpc } from '../../ipc';
import { Splash } from './Splash';
import styles from './Splash.module.css';

// The root route's pieces (src/renderer/routes/__root.tsx).

/** Thrown by the root's beforeLoad when DevBrain couldn't open its data folder. */
export class DevBrainUnavailableError extends Error {
  constructor() {
    super('DevBrain couldn’t open its data folder');
    this.name = 'DevBrainUnavailableError';
  }
}

// development only: import.meta.env.DEV is false in a production build, which drops the import
const RouterDevtools = import.meta.env.DEV
  ? lazy(() =>
      import('@tanstack/react-router-devtools').then((devtools) => ({
        default: devtools.TanStackRouterDevtools,
      })),
    )
  : () => null;

/**
 * The window: toasts, and the page, or the splash in its place while the router is on its way to
 * another workspace (from the moment a switch starts until its page has loaded; the open takes
 * 600ms at least). The page is unmounted, not hidden: the workspace closing never draws or runs
 * again, and the next one's page mounts fresh.
 */
export function RootLayout() {
  const router = useRouter();
  // where the router is going (the URL moves as a navigation starts), and what it last finished:
  // nothing until the first load has (RootPending's)
  const target = useRouterState({ select: (s) => workspaceIdOfPage(s.location.pathname) });
  const shown = useRouterState({
    select: (s) =>
      s.resolvedLocation ? workspaceIdOfPage(s.resolvedLocation.pathname) : undefined,
  });
  const switching = shown !== undefined && target !== null && target !== shown;
  return (
    <ToastProvider>
      {switching ? <Splash /> : <Outlet />}
      {import.meta.env.DEV && import.meta.env.MODE !== 'test' && (
        <Suspense>
          <RouterDevtools router={router} position="bottom-right" />
        </Suspense>
      )}
    </ToastProvider>
  );
}

/**
 * The window during the first load, which the router otherwise leaves empty: the splash when the
 * window opens on a workspace that isn't open (startup), else the empty window (a reload,
 * onboarding), which the first page replaces in a moment. Decided as it first draws: the open
 * finishes in main before the splash's minimum is up, and the splash stays until then.
 */
export function RootPending() {
  const shown = useRouterState({ select: (state) => workspaceIdOfPage(state.location.pathname) });
  const queryClient = useQueryClient();
  const [opening] = useState(() => {
    // seeded from the initial load context; unknown without one, when the splash shows anyway
    const open = queryClient.getQueryData(trpc.workspaces.current.queryKey());
    return shown !== null && shown !== open?.id;
  });
  return opening ? <Splash /> : <div className={styles.blank} aria-busy />;
}

export function RootError({ error }: ErrorComponentProps) {
  if (error instanceof DevBrainUnavailableError) return <DevBrainUnavailable />;
  return (
    <OnboardingScreen
      logo={<Logomark size="md" />}
      title="Something went wrong"
      description="DevBrain hit an error it couldn’t recover from. Reload the window to try again."
    >
      <Button icon={RotateCw} onClick={() => window.location.reload()}>
        Reload
      </Button>
    </OnboardingScreen>
  );
}

/**
 * DevBrain couldn't open its data folder (InitialLoadContext.devBrainAvailable is false): nothing
 * that needs it can run, so the window says so and offers the log file, which says why.
 */
export function DevBrainUnavailable() {
  const showLogFile = useMutation(trpc.app.showLogFile.mutationOptions());
  return (
    <OnboardingScreen
      logo={<Logomark size="md" />}
      title="DevBrain couldn’t open its data folder"
      description="Check that the folder is there and DevBrain can read it, then quit and reopen DevBrain. The log file says what went wrong."
    >
      <Button icon={ScrollText} onClick={() => showLogFile.mutate()}>
        Show Log File
      </Button>
    </OnboardingScreen>
  );
}
