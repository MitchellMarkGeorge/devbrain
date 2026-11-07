import { useNavigate } from '@tanstack/react-router';
import { ArrowLeft } from 'lucide-react';
import { Button, OnboardingScreen } from '../../components';
import { useWorkspaceActions } from '../workspaces/workspace-actions';
import { byLastOpened, WorkspaceRows } from './WorkspaceRows';

/** Choose workspace (`/onboarding/choose_workspace`): every workspace, for when Welcome shows the recent ones. */
export function ChooseWorkspace() {
  const { workspaces } = useWorkspaceActions();
  const navigate = useNavigate();
  return (
    <OnboardingScreen data-page="/onboarding/choose_workspace" title="Choose a workspace">
      <WorkspaceRows label="Workspaces" workspaces={byLastOpened(workspaces)} />
      <Button variant="ghost" icon={ArrowLeft} onClick={() => navigate({ to: '/onboarding' })}>
        Back
      </Button>
    </OnboardingScreen>
  );
}
