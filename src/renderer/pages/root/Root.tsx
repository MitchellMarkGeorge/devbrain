import { lazy, Suspense } from 'react';
import { Outlet, useRouter, type ErrorComponentProps } from '@tanstack/react-router';
import { useMutation } from '@tanstack/react-query';
import { RotateCw, ScrollText } from 'lucide-react';
import { Button, Logomark, AppShell, ToastProvider } from '../../components';
import { trpc } from '../../ipc';
import { ModalProvider } from '../../modals';
import { useWorkspaceLoading } from './use-workspace-loading';

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
 * The window: toasts, dialogs (`useModals`) and the page, or none of them while a workspace loads
 * (`useWorkspaceLoading`): the splash, around the router, is then all the window shows. The page
 * is unmounted, not hidden: the workspace closing never draws or runs again, and the next one's
 * page mounts fresh.
 */
export function RootLayout() {
  const router = useRouter();
  const loading = useWorkspaceLoading();
  return (
    <ToastProvider>
      <ModalProvider closed={loading}>{!loading && <Outlet />}</ModalProvider>
      {import.meta.env.DEV && import.meta.env.MODE !== 'test' && (
        <Suspense>
          <RouterDevtools router={router} position="bottom-right" />
        </Suspense>
      )}
    </ToastProvider>
  );
}

export function RootError({ error }: ErrorComponentProps) {
  if (error instanceof DevBrainUnavailableError) return <DevBrainUnavailable />;
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
