import { ToastProvider } from '../components';
import { ServicesProvider, type Services } from './context';
import { OnboardingApp } from './OnboardingApp';
import type { AppRouter } from '../router';
import { DevBrainUnavailable, Splash } from './Splash';
import { WorkspaceApp } from './WorkspaceApp';
import { useWorkspaceState, type WorkspaceStateStore } from './workspace-state';

export interface WindowContentProps {
  services: Services;
  workspaceState: WorkspaceStateStore;
  /** the app's router, made once (main.tsx) */
  router: AppRouter;
}

/**
 * The window, as a function of the workspace state main sends (workspace-state.ts): the splash
 * while a workspace opens, onboarding while none is open, and the app while one is. Only the app
 * has a router, mounted only while it shows, so no route ever follows a workspace opening, closing
 * or failing: the window swaps what it draws instead.
 */
export function WindowContent({ services, workspaceState, router }: WindowContentProps) {
  const shown = useWorkspaceState(workspaceState);
  if (services.initialLoadContext?.devBrainAvailable === false) return <DevBrainUnavailable />;
  return (
    <ServicesProvider value={services}>
      <ToastProvider>
        {shown.state.status === 'opening' && <Splash name={shown.state.workspace.name} />}
        {shown.state.status === 'none' && (
          // the error dialog starts afresh each time onboarding comes back
          <OnboardingApp key={shown.version} error={shown.state.error} />
        )}
        {shown.state.status === 'open' && (
          <WorkspaceApp key={shown.state.workspace.id} router={router} error={shown.state.error} />
        )}
      </ToastProvider>
    </ServicesProvider>
  );
}
