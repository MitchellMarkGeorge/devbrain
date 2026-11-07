import { Link } from '@tanstack/react-router';
import { useSuspenseInfiniteQuery } from '@tanstack/react-query';
import { ArrowLeft } from 'lucide-react';
import { Button, Logomark, OnboardingScreen, WorkspaceList } from '../../components';
import { trpc } from '../../ipc';
import { WorkspaceRow } from './workspace-rows';
import styles from './Onboarding.module.css';

const PAGE_SIZE = 20;

/** Every workspace, a page at a time, in the order they were created. */
export const workspacePagesOptions = () =>
  trpc.workspaces.list.infiniteQueryOptions(
    { limit: PAGE_SIZE },
    { getNextPageParam: (page) => page.nextCursor },
  );

/** Choose workspace: all of them, paged, for when Welcome's card shows only the recent ones. */
export function ChooseWorkspace() {
  const { data, hasNextPage, fetchNextPage, isFetchingNextPage } =
    useSuspenseInfiniteQuery(workspacePagesOptions());
  return (
    <OnboardingScreen
      logo={<Logomark size="md" />}
      title="Choose a workspace"
      description="Every workspace in your DevBrain folder."
    >
      <WorkspaceList label="Workspaces" className={styles.list}>
        {data.pages
          .flatMap((page) => page.items)
          .map((workspace) => (
            <WorkspaceRow key={workspace.id} workspace={workspace} />
          ))}
        {hasNextPage && (
          <Button
            variant="link"
            size="sm"
            className={styles.more}
            disabled={isFetchingNextPage}
            onClick={() => void fetchNextPage()}
          >
            Show More
          </Button>
        )}
      </WorkspaceList>
      <div className={styles.actions}>
        <Button
          variant="ghost"
          icon={ArrowLeft}
          render={<Link to="/onboarding" />}
          nativeButton={false}
        >
          Back
        </Button>
      </div>
    </OnboardingScreen>
  );
}
