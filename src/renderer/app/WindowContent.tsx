import type { RouterHistory } from '@tanstack/react-router';
import { ToastProvider } from '../components';
import type { AppRouter } from '../router';
import { ServicesProvider, type Services } from './context';
import { OnboardingApp } from './OnboardingApp';
import { DevBrainUnavailable, Splash } from './Splash';
import { WorkspaceApp } from './WorkspaceApp';
import { useWorkspaceState, type WorkspaceStateStore } from './workspace-state';

export interface WindowContentProps {
  services: Services;
  workspaceState: WorkspaceStateStore;
  /** the app's history; the window's hash history by default, memory history in tests */
  history?: RouterHistory;
  /** told each router as it is made, for tests */
  onRouter?: (router: AppRouter) => void;
}

/**
 * The window, as a function of the workspace state main sends (workspace-state.ts): the splash
 * while a workspace opens, onboarding while none is open, and the app while one is. Each has its
 * own router, made when it mounts, so no route ever follows a workspace opening, closing or
 * failing: the window swaps what it draws instead.
 */
export function WindowContent({ services, workspaceState, history, onRouter }: WindowContentProps) {
  const shown = useWorkspaceState(workspaceState);
  if (services.initialLoadContext?.devBrainAvailable === false) return <DevBrainUnavailable />;
  return (
    <ServicesProvider value={services}>
      <ToastProvider>
        {shown === null && <Splash />}
        {shown?.state.status === 'opening' && <Splash name={shown.state.workspace.name} />}
        {shown?.state.status === 'none' && (
          // a new router, and the error dialog, for each time onboarding comes back
          <OnboardingApp key={shown.version} error={shown.state.error} onRouter={onRouter} />
        )}
        {shown?.state.status === 'open' && (
          <WorkspaceApp
            key={shown.state.workspace.id}
            workspace={shown.state.workspace}
            error={shown.state.error}
            keepPage={shown.keepPage}
            history={history}
            onRouter={onRouter}
          />
        )}
      </ToastProvider>
    </ServicesProvider>
  );
}
