import { Link, useNavigate } from '@tanstack/react-router';
import { CircleHelp, Folder, Plus } from 'lucide-react';
import { Button, Flex, Logomark, OnboardingScreen } from '../../components';
import { usePlatform } from '../../components/lib/platform';
import { useWorkspaceActions } from '../workspaces/workspace-actions';
import { byLastOpened, WorkspaceRows } from './WorkspaceRows';

// how many workspaces Welcome lists; Choose workspace lists them all
const RECENT = 3;

/**
 * Welcome (`/onboarding`): with no workspace yet, create one or add a folder (Figma 7175:19898);
 * with some, the most recent ones first (7285:53770), and all of them a click away.
 */
export function Welcome() {
  const { workspaces, moreWorkspaces, openFolder, busy } = useWorkspaceActions();
  const navigate = useNavigate();
  const platform = usePlatform();
  const recent = byLastOpened(workspaces).slice(0, RECENT);
  return (
    <OnboardingScreen
      data-page="/onboarding"
      logo={<Logomark size="md" />}
      title="Welcome to DevBrain"
      description={
        workspaces.length > 0
          ? 'Pick up where you left off, or start a new workspace.'
          : `Tasks, notes and your calendar in one place, kept in a folder on your ${platform === 'macos' ? 'Mac' : 'computer'}.`
      }
      footer={
        // there is no help yet: drawn disabled until there is
        <Button variant="ghost" size="sm" icon={CircleHelp} disabled>
          What’s a workspace?
        </Button>
      }
    >
      {recent.length > 0 && <WorkspaceRows label="Recent workspaces" workspaces={recent} />}
      {(workspaces.length > RECENT || moreWorkspaces) && (
        <Button
          variant="link"
          nativeButton={false}
          render={<Link to="/onboarding/choose_workspace" />}
        >
          All Workspaces
        </Button>
      )}
      <Flex gap="2">
        <Button icon={Plus} onClick={() => navigate({ to: '/onboarding/new_workspace' })}>
          Create Workspace
        </Button>
        <Button icon={Folder} onClick={openFolder} disabled={busy}>
          Open Existing Folder…
        </Button>
      </Flex>
    </OnboardingScreen>
  );
}
