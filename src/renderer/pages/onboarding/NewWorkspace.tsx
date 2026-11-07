import { OnboardingScreen } from '../../components';
import { CreateWorkspaceCard } from '../workspaces/CreateWorkspaceCard';

/** Create workspace (`/onboarding/new_workspace`, Figma 7175:20087): only when none is open. */
export function NewWorkspace() {
  return (
    <OnboardingScreen data-page="/onboarding/new_workspace">
      <CreateWorkspaceCard />
    </OnboardingScreen>
  );
}
