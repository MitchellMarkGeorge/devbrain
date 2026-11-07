import { lazy, Suspense, useEffect } from 'react';
import { Outlet, useRouter, type ErrorComponentProps } from '@tanstack/react-router';
import { useMutation } from '@tanstack/react-query';
import { RotateCw, ScrollText } from 'lucide-react';
import { Button, Logomark, OnboardingScreen, ToastProvider } from '../../components';
import { trpc } from '../../ipc';
import { workspaceIdOfPage } from '@common/types';
import { events } from '../../ipc';
import { isOpeningWorkspace } from '../../workspace/open';
import { useSwitchingWorkspace } from './use-splash';

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
 * The window: toasts, and the page, except while the router is on its way to another workspace:
 * the page is unmounted then, under the splash (WorkspaceSplash, beside the router), so the
 * workspace being closed never draws again and its queries never refetch with the new one's data.
 * The new workspace's page mounts once its loaders have run.
 */
export function RootLayout() {
  const router = useRouter();
  const switching = useSwitchingWorkspace(router);
  useFollowOutsideChanges();
  return (
    <ToastProvider>
      {!switching && <Outlet />}
      {import.meta.env.DEV && import.meta.env.MODE !== 'test' && (
        <Suspense>
          <RouterDevtools router={router} position="bottom-right" />
        </Suspense>
      )}
    </ToastProvider>
  );
}

/**
 * What is open changed without a navigation of this window's (main's `workspace.changed`, while
 * no open of this window's runs): the open workspace was deleted or closed, so the window goes to
 * onboarding; or another one opened elsewhere, so it goes to that one's page.
 */
function useFollowOutsideChanges() {
  const router = useRouter();
  useEffect(
    () =>
      events.on('workspace.changed', ({ id, opening }) => {
        if (opening !== null || isOpeningWorkspace()) return;
        const shown = workspaceIdOfPage(router.latestLocation.pathname);
        if (id === null) {
          if (shown !== null) void router.navigate({ to: '/onboarding', replace: true });
        } else if (shown !== id) {
          void router.navigate({ to: '/app/$workspaceId', params: { workspaceId: id } });
        }
      }),
    [router],
  );
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
