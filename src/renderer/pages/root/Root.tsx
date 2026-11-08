import { lazy, Suspense } from 'react';
import { Outlet, useRouter } from '@tanstack/react-router';
import { useMutation } from '@tanstack/react-query';
import { RotateCw, ScrollText } from 'lucide-react';
import { Button, Logomark, AppShell, ToastProvider } from '../../components';
import { trpc } from '../../ipc';
import { ModalProvider } from '../../modals';
import { useSwitchingWorkspace } from './use-switching-workspace';

// The root route's pieces (src/renderer/routes/__root.tsx).

// development only: import.meta.env.DEV is false in a production build, which drops the import
const RouterDevtools = import.meta.env.DEV
  ? lazy(() =>
      import('@tanstack/react-router-devtools').then((devtools) => ({
        default: devtools.TanStackRouterDevtools,
      })),
    )
  : () => null;

/**
 * The window: toasts, dialogs (`useModals`) and the page. Dialogs belong to the workspace open, so
 * they're dropped as soon as a switch to another starts (`useSwitchingWorkspace`); the splash is
 * `/app/$workspaceId`'s pending component.
 */
export function RootLayout() {
  const router = useRouter();
  const switching = useSwitchingWorkspace();
  return (
    <ToastProvider>
      <ModalProvider closed={switching}>
        <Outlet />
      </ModalProvider>
      {import.meta.env.DEV && import.meta.env.MODE !== 'test' && (
        <Suspense>
          <RouterDevtools router={router} position="bottom-right" />
        </Suspense>
      )}
    </ToastProvider>
  );
}

export function RootError() {
  return (
    <AppShell
      logo={<Logomark size="md" />}
      title="Something went wrong"
      description="DevBrain hit an error it couldn’t recover from. Reload the window to try again."
    >
      <Button icon={RotateCw} onClick={() => window.location.reload()}>
        Reload
      </Button>
    </AppShell>
  );
}

/**
 * DevBrain couldn't open its data folder (InitialLoadContext.devBrainAvailable is false): nothing
 * that needs it can run, so the window says so and offers the log file, which says why.
 */
export function DevBrainUnavailable() {
  const showLogFile = useMutation(trpc.app.showLogFile.mutationOptions());
  return (
    <AppShell
      logo={<Logomark size="md" />}
      title="DevBrain couldn’t open its data folder"
      description="Check that the folder is there and DevBrain can read it, then quit and reopen DevBrain. The log file says what went wrong."
    >
      <Button icon={ScrollText} onClick={() => showLogFile.mutate()}>
        Show Log File
      </Button>
    </AppShell>
  );
}
