import { useNavigate } from '@tanstack/react-router';
import { OnboardingScreen } from '../../components';
import { CreateWorkspaceForm, CreateWorkspaceTitle } from '../workspaces/CreateWorkspaceForm';

/**
 * Create workspace (Figma 7175:20087), when none is open: the form on a card. Creating goes to
 * the new workspace, which opens it; Back returns to Welcome.
 */
export function CreateWorkspacePage() {
  const navigate = useNavigate();
  return (
    <OnboardingScreen>
      <CreateWorkspaceForm
        layout="page"
        title={<CreateWorkspaceTitle>Create a workspace</CreateWorkspaceTitle>}
        onCancel={() => void navigate({ to: '/onboarding' })}
        onCreated={(workspace) =>
          void navigate({ to: '/app/$workspaceId', params: { workspaceId: workspace.id } })
        }
      />
    </OnboardingScreen>
  );
}
