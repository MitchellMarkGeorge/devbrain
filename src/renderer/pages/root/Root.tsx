import { lazy, Suspense } from 'react';
import { Outlet, useRouter, type ErrorComponentProps } from '@tanstack/react-router';
import { useMutation } from '@tanstack/react-query';
import { RotateCw, ScrollText } from 'lucide-react';
import { Button, Logomark, OnboardingScreen, ToastProvider } from '../../components';
import { trpc } from '../../ipc';
import { useSplash } from '../../workspace/splash';
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
 * The window: toasts, and the page, or the splash in its place while a workspace opens. The page
 * is unmounted under the splash, so the workspace being closed never draws again, and the new
 * one's page mounts once its loaders have run.
 */
export function RootLayout() {
  const router = useRouter();
  const splash = useSplash(router.options.context.splash);
  return (
    <ToastProvider>
      {splash.visible ? <Splash workspace={splash.workspace} /> : <Outlet />}
      {import.meta.env.DEV && import.meta.env.MODE !== 'test' && (
        <Suspense>
          <RouterDevtools router={router} position="bottom-right" />
        </Suspense>
      )}
    </ToastProvider>
  );
}

/**
 * The window during the first load: the splash while a workspace opens, else the empty window
 * (a reload, onboarding), which the first page replaces in a moment.
 */
export function RootPending() {
  const router = useRouter();
  const splash = useSplash(router.options.context.splash);
  return splash.visible ? (
    <Splash workspace={splash.workspace} />
  ) : (
    <div className={styles.blank} aria-busy />
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
