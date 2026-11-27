import { lazy, Suspense, useEffect } from 'react';
import { Outlet, useRouter } from '@tanstack/react-router';
import { useMutation, useQuery } from '@tanstack/react-query';
import { RotateCw, ScrollText } from 'lucide-react';
import { Button, FormatProvider, Logomark, AppShell, ToastProvider } from '@renderer/components';
import { trpc } from '@renderer/ipc';
import { ModalProvider } from './modals';
import { PageSearchesProvider } from './page-searches';
import { useUndoStack } from '@renderer/keyboard';
import { useSwitchingWorkspace } from './hooks/use-switching-workspace';

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
 * The window: toasts, the date formats (`FormatProvider`, in the settings' time format), dialogs
 * (`useModals`), each page's last search (`usePageSearches`) and the page. The formats are here rather than in the workspace layout as dialogs
 * render here, outside the page. Dialogs and the undo stack belong to the workspace open, so
 * they're dropped as soon as a switch to another starts (`useSwitchingWorkspace`); the splash is
 * `/app/$workspaceId`'s pending component. The keyboard layer is around all of it (`AppWindow`),
 * as the shortcuts dialog reads it, dialogs register commands and this clears its undo stack.
 */
export function RootLayout() {
  const router = useRouter();
  const switching = useSwitchingWorkspace();
  // the settings are seeded before the first render, and belong to no workspace
  const timeFormat = useQuery(trpc.settings.get.queryOptions()).data?.general.timeFormat;

  const undoStack = useUndoStack();
  useEffect(() => {
    if (switching) undoStack.clear();
  }, [switching, undoStack]);

  return (
    <ToastProvider>
      <FormatProvider timeFormat={timeFormat}>
        <ModalProvider closed={switching}>
          <PageSearchesProvider>
            <Outlet />
          </PageSearchesProvider>
        </ModalProvider>
      </FormatProvider>
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
