import { useSyncExternalStore, type ReactNode } from 'react';
import { useRouter } from '@tanstack/react-router';
import { ToastProvider } from '../../components';
import { useHeldFor } from '../../session/use-held-for';
import { WorkspaceActionsProvider } from '../workspaces/workspace-actions';
import { DevBrainUnavailable } from './DevBrainUnavailable';
import { Splash } from './Splash';

/**
 * The root route's shell, around the whole route tree and mounted once: the toasts and the workspace
 * actions (whose error dialog outlives a switch), then the route tree, or in its place the splash
 * while a workspace opens and its page loads, or the error when DevBrain couldn't load.
 *
 * The splash replaces the tree rather than covering it: the old workspace's page is unmounted from
 * the first frame of a switch, and the new one mounts with its data
 * (docs/renderer/router-splash-exploration.md).
 */
export function RootShell({ children }: { children: ReactNode }) {
  const { devBrainAvailable } = useRouter().options.context;
  return (
    <ToastProvider>
      {devBrainAvailable ? (
        <WorkspaceActionsProvider>
          <SplashGate>{children}</SplashGate>
        </WorkspaceActionsProvider>
      ) : (
        <DevBrainUnavailable />
      )}
    </ToastProvider>
  );
}

function SplashGate({ children }: { children: ReactNode }) {
  const { session, splashMinimumMs } = useRouter().options.context;
  const busy = useSyncExternalStore(session.subscribe, () => session.getState().busy);
  const splash = useHeldFor(busy, splashMinimumMs);
  return splash ? <Splash /> : children;
}
