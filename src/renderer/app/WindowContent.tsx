import { ToastProvider } from '../components';
import { ServicesProvider, type Services } from './context';
import { OnboardingApp } from './OnboardingApp';
import type { WindowRouters } from './routers';
import { DevBrainUnavailable, Splash } from './Splash';
import { WorkspaceApp } from './WorkspaceApp';
import { useWorkspaceState, type WorkspaceStateStore } from './workspace-state';

export interface WindowContentProps {
  services: Services;
  workspaceState: WorkspaceStateStore;
  routers: WindowRouters;
}

/**
 * The window, as a function of the workspace state main sends (workspace-state.ts): the splash
 * while a workspace opens, onboarding while none is open, and the app while one is. Onboarding and
 * the app each have a router (routers.ts), mounted only while they show, so no route ever follows
 * a workspace opening, closing or failing: the window swaps what it draws instead.
 */
export function WindowContent({ services, workspaceState, routers }: WindowContentProps) {
  const shown = useWorkspaceState(workspaceState);
  if (services.initialLoadContext?.devBrainAvailable === false) return <DevBrainUnavailable />;
  return (
    <ServicesProvider value={services}>
      <ToastProvider>
        {shown.state.status === 'opening' && <Splash name={shown.state.workspace.name} />}
        {shown.state.status === 'none' && (
          // the error dialog starts afresh each time onboarding comes back
          <OnboardingApp
            key={shown.version}
            router={routers.onboarding}
            error={shown.state.error}
          />
        )}
        {shown.state.status === 'open' && (
          <WorkspaceApp
            key={shown.state.workspace.id}
            router={routers.app}
            error={shown.state.error}
          />
        )}
      </ToastProvider>
    </ServicesProvider>
  );
}
