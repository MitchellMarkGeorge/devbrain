import { useInfiniteQuery } from '@tanstack/react-query';
import { useNavigate, useRouter } from '@tanstack/react-router';
import { ArrowLeft, Folder } from 'lucide-react';
import { Button, Flex, OnboardingScreen } from '../../components';
import { useWorkspaceActions } from '../workspaces/workspace-actions';
import { byLastOpened, WorkspaceRows } from './WorkspaceRows';

/**
 * Choose workspace (`/onboarding/choose_workspace`): every workspace, for when Welcome lists only
 * the recent ones. The registry comes a page at a time; Show More reads the next.
 */
export function ChooseWorkspace() {
  const { trpc } = useRouter().options.context;
  const { openFolder, busy } = useWorkspaceActions();
  const navigate = useNavigate();
  const pages = useInfiniteQuery(
    trpc.workspaces.list.infiniteQueryOptions(
      {},
      { getNextPageParam: (page) => page.nextCursor ?? undefined },
    ),
  );
  const workspaces = byLastOpened((pages.data?.pages ?? []).flatMap((page) => page.items));
  return (
    <OnboardingScreen
      data-page="/onboarding/choose_workspace"
      title="Choose a workspace"
      description="Open one of your workspaces, or add one from a folder."
    >
      <WorkspaceRows label="Workspaces" workspaces={workspaces} />
      {pages.hasNextPage && (
        <Button
          variant="ghost"
          onClick={() => void pages.fetchNextPage()}
          disabled={pages.isFetchingNextPage}
        >
          Show More
        </Button>
      )}
      <Flex gap="2">
        <Button variant="ghost" icon={ArrowLeft} onClick={() => navigate({ to: '/onboarding' })}>
          Back
        </Button>
        <Button icon={Folder} onClick={openFolder} disabled={busy}>
          Open Existing Folder…
        </Button>
      </Flex>
    </OnboardingScreen>
  );
}
